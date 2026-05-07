import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import type {
  AnnotationProvider,
  DownloadProgress,
  DownloadProgressCallback,
  ErrorCallback,
  InferenceRequest,
  InferenceResult,
  ProviderError,
  ProviderStatus,
  StatusCallback,
  WarningCallback,
  WorkerMessageType,
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
    if (!WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1, 28, 0, 65, 0, 253, 15, 253, 12, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253, 186, 1, 26, 11,
    ])))
      errors.push("WASM SIMD");
  } catch {
    errors.push("WASM SIMD");
  }

  if (typeof OffscreenCanvas === "undefined")
    errors.push("OffscreenCanvas");

  // SharedArrayBuffer: enables multi-threaded WASM. Without it, falls back to single-threaded.
  if (typeof SharedArrayBuffer === "undefined")
    warnings.push("SharedArrayBuffer unavailable. Falling back to single-threaded WASM");

  return { errors, warnings };
}

export interface BrowserAnnotationProviderOptions {
  onStatus?: StatusCallback;
  onProgress?: DownloadProgressCallback;
  onWarning?: WarningCallback;
  onError?: ErrorCallback;
}

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
      const err: ProviderError = { kind: "unsupported", message: `Missing browser APIs: ${errors.join(", ")}` };
      this.onError?.(err);
      this.onStatus?.("failure");
      throw new Error(err.message);
    }

    for (const w of warnings)
      this.onWarning?.(w);

    this.onStatus?.("loading");

    try {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (err) {
      this.onStatus?.("failure");
      throw err;
    }

    this.worker.onmessage = (e: MessageEvent) => {
      const { id, type, success, result, error } = e.data;

      if (type === "ready")
        return;

      if (type === "status") {
        this.onStatus?.(result as ProviderStatus);
        return;
      }

      if (type === "progress") {
        this.onProgress?.(result as DownloadProgress);
        return;
      }

      if (type === "warning") {
        this.onWarning?.(result as string);
        return;
      }

      if (type === "error") {
        this.onError?.(result as ProviderError);
        return;
      }

      const entry = this.pending.get(id);
      if (!entry)
        return;

      this.pending.delete(id);

      success ? entry.resolve(result) : entry.reject(new Error(error ?? "Worker error"));
    };

    this.worker.onerror = (e: ErrorEvent) => {
      const msg = e.message || "Worker error";
      this.onStatus?.("failure");
      for (const entry of this.pending.values())
        entry.reject(new Error(msg));
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

  // Client-side only: rejects the pending promise but the worker keeps computing.
  // Only aborts the most recent inference. Earlier in-flight requests are not cancelled.
  abort(): void {
    if (this.lastInferenceId === null)
      return;

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
    payload: WorkerRequest<T>
  ): { id: number; promise: Promise<WorkerResponse<T>> } {
    const id = this.nextId++;
    const promise = new Promise<WorkerResponse<T>>((resolve, reject) => {
      if (!this.worker)
        return reject(new Error("Worker not initialized"));

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ id, type, payload });
    });
    return { id, promise };
  }
}
