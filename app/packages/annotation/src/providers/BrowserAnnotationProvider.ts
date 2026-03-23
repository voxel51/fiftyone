import type {
  AnnotationProvider,
  DownloadProgressCallback,
  InferenceRequest,
  InferenceResult,
  WarningCallback,
  WorkerMessageType,
  WorkerNotifications,
  WorkerRequest,
  WorkerResponse,
} from "./types";

type Pending<T> = {
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

export class BrowserAnnotationProvider implements AnnotationProvider {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<number, Pending<unknown>>();
  private lastInferenceId: number | null = null;
  private onProgress: DownloadProgressCallback | null = null;
  private onWarning: WarningCallback | null = null;

  async initialize(onProgress?: DownloadProgressCallback, onWarning?: WarningCallback): Promise<void> {
    if (this.worker)
      throw new Error("Already initialized. Call dispose() first.");

    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    this.onProgress = onProgress ?? null;
    this.onWarning = onWarning ?? null;

    this.worker.onmessage = (e: MessageEvent) => {
      const { id, type, success, result, error } = e.data;

      if (type === "ready")
        return;

      if (type === "progress") {
        this.onProgress?.(result as WorkerNotifications["progress"]);
        return;
      }

      if (type === "warning") {
        this.onWarning?.(result as WorkerNotifications["warning"]);
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
      for (const entry of this.pending.values())
        entry.reject(new Error(msg));
      this.pending.clear();
    };

    await this.send("loadModel", {}).promise;
  }

  async infer(request: InferenceRequest): Promise<InferenceResult> {
    const { id, promise } = this.send("embedAndDecode", request);
    this.lastInferenceId = id;
    return promise;
  }

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
    this.onProgress = null;
    this.onWarning = null;
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
