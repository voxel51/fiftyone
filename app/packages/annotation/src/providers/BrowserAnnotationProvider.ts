import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import type {
  AnnotationProvider,
  BitmapEncodeRequest,
  BitmapInferenceRequest,
  DownloadProgressCallback,
  ErrorCallback,
  InferenceRequest,
  InferenceResult,
  ProviderError,
  StatusCallback,
  WarningCallback,
  WorkerMessageType,
  WorkerOutbound,
  WorkerRequest,
  WorkerResponse,
} from "./types";

type Pending<T> = {
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

// Check that the browser supports the APIs required for ONNX inference.
function checkBrowserCompatibility(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // WASM SIMD: same byte sequence used by onnxruntime-web to detect SIMD support.
  // Source: https://github.com/microsoft/onnxruntime/blob/main/js/web/lib/wasm/wasm-factory.ts
  try {
    if (
      !WebAssembly.validate(
        new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1,
          28, 0, 65, 0, 253, 15, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 253, 186, 1, 26, 11,
        ]),
      )
    )
      errors.push("WASM SIMD");
  } catch {
    errors.push("WASM SIMD");
  }

  if (typeof OffscreenCanvas === "undefined") errors.push("OffscreenCanvas");

  // SharedArrayBuffer: enables multi-threaded WASM. Without it, falls back to single-threaded.
  if (typeof SharedArrayBuffer === "undefined")
    warnings.push(
      "SharedArrayBuffer unavailable. Falling back to single-threaded WASM",
    );

  return { errors, warnings };
}

export interface BrowserAnnotationProviderOptions {
  onStatus?: StatusCallback;
  onProgress?: DownloadProgressCallback;
  onWarning?: WarningCallback;
  onError?: ErrorCallback;
}

/**
 * Factory that returns the Worker backing the SAM2 inference pipeline.
 */
type WorkerFactory = () => Worker;

declare global {
  interface Window {
    /**
     * Test-only seam: when set on `window` before
     * `BrowserAnnotationProvider.initialize()`, substitutes the SAM2 inference
     * worker. Production builds and normal users never set this, so the
     * default factory is used.
     *
     * The replacement worker MUST implement the same protocol as `worker.ts`:
     *   - emit `{ type: "ready" }` once on startup
     *   - respond to `init`, `loadModel`, `embedAndDecode` requests with
     *     matching `{ id, type, success, result }` responses
     *   - emit `status` / `progress` / `warning` / `error` notifications as
     *     appropriate
     *
     * Used by Playwright specs that need deterministic SAM2 output without
     * downloading or running the real ONNX model.
     */
    __FO_TEST_SAM2_WORKER_FACTORY?: WorkerFactory;
  }
}

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

const resolveWorkerFactory = (): WorkerFactory => {
  if (
    typeof window !== "undefined" &&
    typeof window.__FO_TEST_SAM2_WORKER_FACTORY === "function"
  ) {
    return window.__FO_TEST_SAM2_WORKER_FACTORY;
  }
  return defaultWorkerFactory;
};

export class BrowserAnnotationProvider implements AnnotationProvider {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<number, Pending<unknown>>();
  private lastInferenceId: number | null = null;
  private onStatus: StatusCallback | null;
  private onProgress: DownloadProgressCallback | null;
  private onWarning: WarningCallback | null;
  private onError: ErrorCallback | null;

  constructor(options?: BrowserAnnotationProviderOptions) {
    this.onStatus = options?.onStatus ?? null;
    this.onProgress = options?.onProgress ?? null;
    this.onWarning = options?.onWarning ?? null;
    this.onError = options?.onError ?? null;
  }

  async initialize(): Promise<void> {
    if (this.worker)
      throw new Error("Already initialized. Call dispose() first.");

    const { errors, warnings } = checkBrowserCompatibility();

    if (errors.length > 0) {
      const err: ProviderError = {
        kind: "unsupported",
        message: `Missing browser APIs: ${errors.join(", ")}`,
      };
      this.onError?.(err);
      this.onStatus?.("failure");
      throw new Error(err.message);
    }

    for (const w of warnings) this.onWarning?.(w);

    this.onStatus?.("loading");

    try {
      this.worker = resolveWorkerFactory()();
    } catch (err) {
      this.onStatus?.("failure");
      throw err;
    }

    this.worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data;

      if (msg.type === "ready") return;

      if (msg.type === "status") {
        this.onStatus?.(msg.result);
        return;
      }

      if (msg.type === "progress") {
        this.onProgress?.(msg.result);
        return;
      }

      if (msg.type === "warning") {
        this.onWarning?.(msg.result);
        return;
      }

      if (msg.type === "error") {
        this.onError?.(msg.result);
        return;
      }

      const entry = this.pending.get(msg.id);
      if (!entry) return;

      this.pending.delete(msg.id);

      if (msg.success === false) {
        entry.reject(new Error(msg.error ?? "Worker error"));
        return;
      }

      entry.resolve(msg.result);
    };

    this.worker.onerror = (e: ErrorEvent) => {
      const msg = e.message || "Worker error";
      this.onStatus?.("failure");
      for (const entry of this.pending.values()) entry.reject(new Error(msg));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };

    try {
      const params = getFetchParameters();
      this.worker.postMessage({
        type: "init",
        payload: { ...params, headers: mergeHeaders(params.headers) },
      });

      await this.send("loadModel", {}).promise;
      this.onStatus?.("ready");
    } catch (err) {
      this.worker?.terminate();
      this.worker = null;
      this.onStatus?.("failure");
      throw err;
    }
  }

  async infer(request: InferenceRequest): Promise<InferenceResult> {
    const { id, promise } = this.send("embedAndDecode", request);
    this.lastInferenceId = id;
    return promise;
  }

  /**
   * Run SAM2 against an already-decoded frame bitmap (e.g. an ImaVid video
   * frame). Used by video propagation; see `videoPropagation.ts`.
   *
   * The bitmap is passed by structured clone, NOT as a transferable —
   * Firefox rejects a payload that both contains a bitmap and lists it in
   * the transfer list ("invalid transferable array for structured clone").
   * Cloning a single bitmap is cheap (a handle, not a pixel copy), and it
   * leaves the caller's bitmap intact — important when the source is a
   * frame-cache entry the stream still owns.
   */
  async inferBitmap(request: BitmapInferenceRequest): Promise<InferenceResult> {
    const { id, promise } = this.send("embedAndDecodeBitmap", request);
    this.lastInferenceId = id;
    return promise;
  }

  /**
   * Encode-only — run SAM2's image encoder on a frame and cache the
   * embedding keyed on `cacheKey`. No decoder, no result. A later
   * {@link inferBitmap} with the same key then runs the decoder only.
   */
  async encodeBitmap(request: BitmapEncodeRequest): Promise<void> {
    const { promise } = this.send("encodeBitmap", request);
    return promise;
  }

  // Client-side only: rejects the pending promise but the worker keeps computing.
  // Only aborts the most recent inference. Earlier in-flight requests are not cancelled.
  abort(): void {
    if (this.lastInferenceId === null) return;

    const entry = this.pending.get(this.lastInferenceId);
    if (entry) {
      this.pending.delete(this.lastInferenceId);
      entry.reject(new Error("Inference aborted"));
    }

    this.lastInferenceId = null;
  }

  dispose(): void {
    for (const entry of this.pending.values())
      entry.reject(new Error("Provider disposed"));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  isInitialized(): boolean {
    return !!this.worker;
  }

  private send<T extends WorkerMessageType>(
    type: T,
    payload: WorkerRequest<T>,
  ): { id: number; promise: Promise<WorkerResponse<T>> } {
    const id = this.nextId++;
    const promise = new Promise<WorkerResponse<T>>((resolve, reject) => {
      if (!this.worker) return reject(new Error("Worker not initialized"));

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.worker.postMessage({ id, type, payload });
    });
    return { id, promise };
  }
}
