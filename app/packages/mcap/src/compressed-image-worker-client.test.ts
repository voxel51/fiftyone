/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  workerInstances,
  decodeMultimodalCompressedImageRequestMock,
  MockCompressedImageWorker,
} = vi.hoisted(() => {
  const instances: MockCompressedImageWorker[] = [];

  class MockCompressedImageWorker {
    onmessage: ((event: MessageEvent<any>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();

    constructor() {
      instances.push(this);
    }

    emitMessage(data: unknown) {
      this.onmessage?.({ data } as MessageEvent<any>);
    }
  }

  return {
    workerInstances: instances,
    decodeMultimodalCompressedImageRequestMock: vi.fn(),
    MockCompressedImageWorker,
  };
});

vi.mock("./compressed-image-worker.ts?worker&inline", () => ({
  default: MockCompressedImageWorker,
}));

vi.mock("./compressed-image-worker", () => ({
  decodeMultimodalCompressedImageRequest:
    decodeMultimodalCompressedImageRequestMock,
}));

describe("compressed-image-worker-client", () => {
  beforeEach(() => {
    workerInstances.length = 0;
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("transfers the original payload buffer to the worker without cloning it again", async () => {
    vi.stubGlobal("Worker", function Worker() {});
    const {
      decodeCompressedImageInWorker,
      disposeCompressedImageWorkerClient,
    } = await import("./compressed-image-worker-client");
    const payload = Uint8Array.from([1, 2, 3]).buffer;

    const decodePromise = decodeCompressedImageInWorker({
      messageId: "image-1",
      schemaName: "foxglove.CompressedImage",
      payload,
    });

    expect(workerInstances).toHaveLength(1);
    const postMessageCall = workerInstances[0].postMessage.mock.calls[0];
    expect(postMessageCall[0].request.payload).toBe(payload);
    expect(postMessageCall[0].request.schemaName).toBe(
      "foxglove.CompressedImage"
    );
    expect(postMessageCall[1]).toEqual([payload]);

    workerInstances[0].emitMessage({
      requestId: postMessageCall[0].requestId,
      success: true,
      result: {
        messageId: "image-1",
        format: "jpeg",
        frameId: "camera",
        compressedBytes: Uint8Array.from([1, 2, 3]).buffer,
        compressedBytesByteOffset: 0,
        compressedBytesByteLength: 3,
      },
    });

    await expect(decodePromise).resolves.toMatchObject({
      messageId: "image-1",
      format: "jpeg",
      frameId: "camera",
    });

    disposeCompressedImageWorkerClient();
  });

  it("preserves the exact returned compressed-image byte view from the worker", async () => {
    vi.stubGlobal("Worker", function Worker() {});
    const {
      decodeCompressedImageInWorker,
      disposeCompressedImageWorkerClient,
    } = await import("./compressed-image-worker-client");

    const decodePromise = decodeCompressedImageInWorker({
      messageId: "image-3",
      schemaName: "foxglove.CompressedImage",
      payload: Uint8Array.from([1, 2, 3]).buffer,
    });
    const postMessageCall = workerInstances[0].postMessage.mock.calls[0];
    const sharedBytes = Uint8Array.from([9, 8, 7, 6, 5]).buffer;

    workerInstances[0].emitMessage({
      requestId: postMessageCall[0].requestId,
      success: true,
      result: {
        messageId: "image-3",
        format: "jpeg",
        frameId: "camera",
        compressedBytes: sharedBytes,
        compressedBytesByteOffset: 1,
        compressedBytesByteLength: 3,
      },
    });

    await expect(decodePromise).resolves.toMatchObject({
      compressedBytes: Uint8Array.from([8, 7, 6]),
    });

    disposeCompressedImageWorkerClient();
  });

  it("falls back to direct decode when workers are unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    decodeMultimodalCompressedImageRequestMock.mockReturnValue({
      messageId: "image-2",
      format: "png",
      frameId: "camera",
      compressedBytes: Uint8Array.from([4, 5, 6]),
    });
    const { decodeCompressedImageInWorker } = await import(
      "./compressed-image-worker-client"
    );

    const decoded = await decodeCompressedImageInWorker({
      messageId: "image-2",
      schemaName: "foxglove.CompressedImage",
      payload: Uint8Array.from([4, 5, 6]).buffer,
    });

    expect(decodeMultimodalCompressedImageRequestMock).toHaveBeenCalledWith({
      messageId: "image-2",
      schemaName: "foxglove.CompressedImage",
      payload: expect.any(ArrayBuffer),
    });
    expect(decoded.format).toBe("png");
  });
});
