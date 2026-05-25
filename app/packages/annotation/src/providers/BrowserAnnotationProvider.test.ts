import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/utilities", () => ({
  getFetchParameters: vi.fn(),
  mergeHeaders: vi.fn(),
}));

import { getFetchParameters, mergeHeaders } from "@fiftyone/utilities";
import { BrowserAnnotationProvider } from "./BrowserAnnotationProvider";

// Mock Worker
class MockWorker {
  onmessage: any = null;
  onerror: any = null;
  terminate = vi.fn();
  postMessage = vi.fn((msg: any) => {
    if (msg.type === "loadModel") {
      setTimeout(() => {
        this.onmessage?.({ data: { id: msg.id, type: "loadModel", success: true } });
      });
    }
  });
}

// Stub API for compatibility check
function stubBrowserAPIs() {
  if (typeof globalThis.OffscreenCanvas === "undefined")
    vi.stubGlobal("OffscreenCanvas", class OffscreenCanvas {});
}

describe("BrowserAnnotationProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubBrowserAPIs();
    vi.mocked(getFetchParameters).mockReturnValue({ origin: "", headers: {}, pathPrefix: "" });
    vi.mocked(mergeHeaders).mockReturnValue({});
  });

  it("Sends init message with fetch parameters after spawning worker", async () => {
    const params = { origin: "http://api", headers: { Auth: "x" }, pathPrefix: "/api/proxy/fiftyone-xyz" };
    vi.mocked(getFetchParameters).mockReturnValue(params);
    vi.mocked(mergeHeaders).mockReturnValue(params.headers);

    let instance: any;
    class TrackedWorker extends MockWorker {
      constructor() {
        super();
        instance = this;
      }
    }
    vi.stubGlobal("Worker", TrackedWorker);

    const provider = new BrowserAnnotationProvider();
    await provider.initialize();

    expect(instance.postMessage.mock.calls[0][0]).toEqual({
      type: "init",
      payload: params,
    });
  });

  it("Normalizes Headers instance to a plain record before posting init", async () => {
    // Headers instances aren't structured-cloneable. mergeHeaders() flattens
    // them so postMessage doesn't throw OR silently drop headers.
    const headersInstance = new Headers({ Auth: "x" });
    const params = { origin: "http://api", headers: headersInstance, pathPrefix: "" };
    const flat = { Auth: "x" };
    vi.mocked(getFetchParameters).mockReturnValue(params as any);
    vi.mocked(mergeHeaders).mockReturnValue(flat);

    let instance: any;
    class TrackedWorker extends MockWorker {
      constructor() {
        super();
        instance = this;
      }
    }
    vi.stubGlobal("Worker", TrackedWorker);

    const provider = new BrowserAnnotationProvider();
    await provider.initialize();

    expect(mergeHeaders).toHaveBeenCalledWith(headersInstance);
    expect(instance.postMessage.mock.calls[0][0].payload.headers).toEqual(flat);
    expect(instance.postMessage.mock.calls[0][0].payload.headers).not.toBeInstanceOf(Headers);
  });

  it("Calls onStatus with loading then ready on successful init", async () => {
    vi.stubGlobal("Worker", MockWorker);

    const onStatus = vi.fn();
    const provider = new BrowserAnnotationProvider({ onStatus });
    await provider.initialize();

    expect(onStatus).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenNthCalledWith(1, "loading");
    expect(onStatus).toHaveBeenNthCalledWith(2, "ready");
  });

  it("Calls onStatus with failure when worker loadModel rejects", async () => {
    class MockWorker {
      onmessage: any = null;
      onerror: any = null;
      terminate = vi.fn();
      postMessage = vi.fn((msg: any) => {
        setTimeout(() => {
          this.onmessage?.({ data: { id: msg.id, type: "loadModel", success: false, error: "ONNX init failed" } });
        });
      });
    }
    vi.stubGlobal("Worker", MockWorker);

    const onStatus = vi.fn();
    const provider = new BrowserAnnotationProvider({ onStatus });

    await expect(provider.initialize()).rejects.toThrow("ONNX init failed");
    expect(onStatus).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenNthCalledWith(1, "loading");
    expect(onStatus).toHaveBeenNthCalledWith(2, "failure");
  });

  it("Throws unsupported and calls onError when OffscreenCanvas is missing", async () => {
    const original = globalThis.OffscreenCanvas;
    delete globalThis.OffscreenCanvas;

    try {
      const onError = vi.fn();
      const onStatus = vi.fn();
      const provider = new BrowserAnnotationProvider({ onError, onStatus });

      await expect(provider.initialize()).rejects.toThrow("Missing browser APIs");
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith({
        kind: "unsupported",
        message: expect.stringContaining("OffscreenCanvas"),
      });
      expect(onStatus).toHaveBeenCalledWith("failure");
    } finally {
      globalThis.OffscreenCanvas = original;
    }
  });

  it("Warns but does not block when SharedArrayBuffer is missing", async () => {
    const original = globalThis.SharedArrayBuffer;
    delete globalThis.SharedArrayBuffer;
    vi.stubGlobal("Worker", MockWorker);

    try {
      const onWarning = vi.fn();
      const provider = new BrowserAnnotationProvider({ onWarning });
      await provider.initialize();

      expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("SharedArrayBuffer"));
    } finally {
      globalThis.SharedArrayBuffer = original;
    }
  });

  it("Throws unsupported when both WASM SIMD and OffscreenCanvas are missing", async () => {
    const originalOC = globalThis.OffscreenCanvas;
    const originalWA = globalThis.WebAssembly;
    delete globalThis.OffscreenCanvas;
    delete globalThis.WebAssembly;

    try {
      const onError = vi.fn();
      const provider = new BrowserAnnotationProvider({ onError });

      await expect(provider.initialize()).rejects.toThrow("Missing browser APIs");
      const msg = onError.mock.calls[0][0].message;
      expect(msg).toContain("WASM SIMD");
      expect(msg).toContain("OffscreenCanvas");
    } finally {
      globalThis.OffscreenCanvas = originalOC;
      globalThis.WebAssembly = originalWA;
    }
  });

  it("Forwards all worker notification types to callbacks", async () => {
    class MockWorker {
      onmessage: any = null;
      onerror: any = null;
      terminate = vi.fn();
      postMessage = vi.fn((msg: any) => {
        if (msg.type === "loadModel") {
          setTimeout(() => {
            this.onmessage?.({ data: { type: "status", result: "loading" } });
            this.onmessage?.({ data: { type: "progress", result: { file: "encoder", loaded: 50, total: 100 } } });
            this.onmessage?.({ data: { type: "warning", result: "IDB unavailable" } });
            this.onmessage?.({ data: { type: "error", result: { kind: "download_failure", message: "cdn down" } } });
            this.onmessage?.({ data: { id: msg.id, type: "loadModel", success: true } });
          });
        }
      });
    }
    vi.stubGlobal("Worker", MockWorker);

    const onStatus = vi.fn();
    const onProgress = vi.fn();
    const onWarning = vi.fn();
    const onError = vi.fn();
    const provider = new BrowserAnnotationProvider({ onStatus, onProgress, onWarning, onError });
    await provider.initialize();

    // Worker-emitted notifications forwarded
    expect(onStatus).toHaveBeenCalledWith("loading");
    expect(onProgress).toHaveBeenCalledWith({ file: "encoder", loaded: 50, total: 100 });
    expect(onWarning).toHaveBeenCalledWith("IDB unavailable");
    expect(onError).toHaveBeenCalledWith({ kind: "download_failure", message: "cdn down" });
  });

  it("Does not spawn worker when APIs are unsupported", async () => {
    const original = globalThis.OffscreenCanvas;
    delete globalThis.OffscreenCanvas;
    const WorkerSpy = vi.fn();
    vi.stubGlobal("Worker", WorkerSpy);

    try {
      const provider = new BrowserAnnotationProvider();
      await provider.initialize().catch(() => {});
      expect(WorkerSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.OffscreenCanvas = original;
    }
  });

  it("Throws if initialize is called twice", async () => {
    vi.stubGlobal("Worker", MockWorker);

    const provider = new BrowserAnnotationProvider();
    await provider.initialize();

    await expect(provider.initialize()).rejects.toThrow("Already initialized");
  });

  it("Dispose rejects pending promises and clears state", async () => {
    vi.stubGlobal("Worker", MockWorker);

    const provider = new BrowserAnnotationProvider();
    await provider.initialize();

    // Start an inference that will never resolve
    const inferPromise = provider.infer({ imageUrl: "test.jpg", points: [{ x: 0.5, y: 0.5, label: 1 }] }).catch((e: Error) => e);
    provider.dispose();

    const err = await inferPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Provider disposed");
  });

  it("Worker onerror rejects all pending promises and emits failure", async () => {
    class MockWorker {
      onmessage: any = null;
      onerror: any = null;
      terminate = vi.fn();
      postMessage = vi.fn((msg: any) => {
        if (msg.type === "loadModel") {
          setTimeout(() => {
            this.onmessage?.({ data: { id: msg.id, type: "loadModel", success: true } });
          });
        }
        // embedAndDecode triggers a worker error instead of resolving
        if (msg.type === "embedAndDecode") {
          setTimeout(() => {
            this.onerror?.({ message: "Worker crashed" });
          });
        }
      });
    }
    vi.stubGlobal("Worker", MockWorker);

    const onStatus = vi.fn();
    const provider = new BrowserAnnotationProvider({ onStatus });
    await provider.initialize();

    const err = await provider.infer({ imageUrl: "test.jpg", points: [{ x: 0.5, y: 0.5, label: 1 }] }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Worker crashed");
    expect(onStatus).toHaveBeenCalledWith("failure");
  });

  it("Abort rejects the most recent inference", async () => {
    vi.stubGlobal("Worker", MockWorker);

    const provider = new BrowserAnnotationProvider();
    await provider.initialize();

    const inferPromise = provider.infer({ imageUrl: "test.jpg", points: [{ x: 0.5, y: 0.5, label: 1 }] }).catch((e: Error) => e);
    provider.abort();

    const err = await inferPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Inference aborted");
  });

  it("Abort is a no-op when no inference is pending", async () => {
    vi.stubGlobal("Worker", MockWorker);

    const provider = new BrowserAnnotationProvider();
    await provider.initialize();

    expect(() => provider.abort()).not.toThrow();
  });

  it("Infer rejects when provider is not initialized", async () => {
    const provider = new BrowserAnnotationProvider();

    const err = await provider.infer({ imageUrl: "test.jpg", points: [{ x: 0.5, y: 0.5, label: 1 }] }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Worker not initialized");
  });
});
