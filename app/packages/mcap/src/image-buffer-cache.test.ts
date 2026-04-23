/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultimodalImageBufferCache } from "./image-buffer-cache";

const { fetchMultimodalBufferMock, decodeCompressedImageInWorkerMock } =
  vi.hoisted(() => ({
    fetchMultimodalBufferMock: vi.fn(),
    decodeCompressedImageInWorkerMock: vi.fn(),
  }));

vi.mock("./api", () => ({
  fetchMultimodalBuffer: fetchMultimodalBufferMock,
}));

vi.mock("./compressed-image-worker-client", () => ({
  decodeCompressedImageInWorker: decodeCompressedImageInWorkerMock,
  disposeCompressedImageWorkerClient: vi.fn(),
}));

describe("MultimodalImageBufferCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:frame"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      "Image",
      class MockImage {
        complete = true;
        decoding = "";
        height = 480;
        naturalHeight = 480;
        naturalWidth = 640;
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        src = "";
        width = 640;

        async decode() {
          return undefined;
        }
      }
    );
  });

  it("reuses buffered windows across overlapping range requests", async () => {
    fetchMultimodalBufferMock.mockResolvedValue({
      sceneId: "scene-1",
      window: { startTimeNs: 0, endTimeNs: 2_999_999_999 },
      streams: [
        {
          streamId: "/camera/front",
          schemaName: "sensor_msgs/msg/CompressedImage",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "frame-1",
              logTimeNs: 1_000_000_000,
              publishTimeNs: 1_000_000_010,
              payload: Uint8Array.from([1, 2, 3]),
            },
          ],
        },
      ],
    });

    const cache = new MultimodalImageBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/camera/front",
      mediaField: "filepath",
      sceneRange: { startNs: 0, endNs: 9_000_000_000 },
    });

    await cache.ensureRange({
      startNs: 1_000_000_000,
      endNs: 2_000_000_000,
    });
    await cache.ensureRange({
      startNs: 1_500_000_000,
      endNs: 2_500_000_000,
    });

    expect(fetchMultimodalBufferMock).toHaveBeenCalledTimes(1);
    expect(cache.getMessageForLogTime(1_000_000_000)?.messageId).toBe(
      "frame-1"
    );
  });

  it("decodes image frames once and caches the object URL result", async () => {
    fetchMultimodalBufferMock.mockResolvedValue({
      sceneId: "scene-1",
      window: { startTimeNs: 0, endTimeNs: 2_999_999_999 },
      streams: [
        {
          streamId: "/camera/front",
          schemaName: "sensor_msgs/msg/CompressedImage",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "frame-1",
              logTimeNs: 1_000_000_000,
              publishTimeNs: 1_000_000_010,
              payload: Uint8Array.from([1, 2, 3]),
            },
          ],
        },
      ],
    });
    decodeCompressedImageInWorkerMock.mockResolvedValue({
      messageId: "frame-1",
      format: "jpeg",
      frameId: "camera",
      compressedBytes: Uint8Array.from([1, 2, 3]),
    });

    const cache = new MultimodalImageBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/camera/front",
      mediaField: "filepath",
      sceneRange: { startNs: 0, endNs: 9_000_000_000 },
    });

    await cache.ensureRange({
      startNs: 1_000_000_000,
      endNs: 2_000_000_000,
    });

    const message = cache.getMessageForLogTime(1_000_000_000);
    expect(message).toBeTruthy();

    const firstFrame = await cache.decodeMessage(message!);
    const secondFrame = await cache.decodeMessage(message!);

    expect(decodeCompressedImageInWorkerMock).toHaveBeenCalledTimes(1);
    expect(decodeCompressedImageInWorkerMock).toHaveBeenCalledWith({
      messageId: "frame-1",
      schemaName: "sensor_msgs/msg/CompressedImage",
      payload: expect.any(ArrayBuffer),
    });
    expect(firstFrame.objectUrl).toBe("blob:frame");
    expect("naturalWidth" in firstFrame.imageSource).toBe(true);
    expect(secondFrame.objectUrl).toBe("blob:frame");
  });

  it("uses prefetched image decodes from binary transport without invoking the worker again", async () => {
    const cache = new MultimodalImageBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/camera/front",
      mediaField: "filepath",
      sceneRange: { startNs: 0, endNs: 9_000_000_000 },
    });
    const stream = {
      streamId: "/camera/front",
      schemaName: "sensor_msgs/msg/CompressedImage",
      messageEncoding: "cdr",
      messages: [
        {
          messageId: "frame-1",
          syncTimestampNs: 1_000_000_000,
          logTimeNs: 1_000_000_000,
          publishTimeNs: 1_000_000_010,
          payload: new Uint8Array(),
        },
      ],
      prefetchedImageMessages: [
        {
          messageId: "frame-1",
          format: "jpeg",
          frameId: "camera",
          compressedBytes: Uint8Array.from([1, 2, 3]),
        },
      ],
    };

    cache.primeStream(stream, {
      startNs: 1_000_000_000,
      endNs: 2_000_000_000,
    });

    const message = cache.getMessageForLogTime(1_000_000_000);
    expect(message).toBeTruthy();

    const frame = await cache.decodeMessage(message!);

    expect(decodeCompressedImageInWorkerMock).not.toHaveBeenCalled();
    expect(frame.objectUrl).toBe("blob:frame");

    cache.dispose();
  });

  it("warms nearby decoded image frames after buffering", async () => {
    fetchMultimodalBufferMock.mockResolvedValue({
      sceneId: "scene-1",
      window: { startTimeNs: 0, endTimeNs: 2_999_999_999 },
      streams: [
        {
          streamId: "/camera/front",
          schemaName: "sensor_msgs/msg/CompressedImage",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "frame-1",
              logTimeNs: 1_000_000_000,
              publishTimeNs: 1_000_000_010,
              payload: Uint8Array.from([1, 2, 3]),
            },
            {
              messageId: "frame-2",
              logTimeNs: 2_000_000_000,
              publishTimeNs: 2_000_000_010,
              payload: Uint8Array.from([4, 5, 6]),
            },
          ],
        },
      ],
    });
    decodeCompressedImageInWorkerMock.mockResolvedValue({
      format: "jpeg",
      frameId: "camera",
      compressedBytes: Uint8Array.from([1, 2, 3]),
    });

    const cache = new MultimodalImageBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/camera/front",
      mediaField: "filepath",
      sceneRange: { startNs: 0, endNs: 9_000_000_000 },
    });

    await cache.ensureRange({
      startNs: 1_000_000_000,
      endNs: 2_000_000_000,
    });
    await cache.warmMessagesAroundLogTime(1_000_000_000, { aheadCount: 1 });

    expect(decodeCompressedImageInWorkerMock).toHaveBeenCalledTimes(2);
    expect(decodeCompressedImageInWorkerMock).toHaveBeenNthCalledWith(1, {
      messageId: "frame-1",
      schemaName: "sensor_msgs/msg/CompressedImage",
      payload: expect.any(ArrayBuffer),
    });
    expect(decodeCompressedImageInWorkerMock).toHaveBeenNthCalledWith(2, {
      messageId: "frame-2",
      schemaName: "sensor_msgs/msg/CompressedImage",
      payload: expect.any(ArrayBuffer),
    });
  });

  it("revokes object URLs when decoded image frames are evicted", async () => {
    (URL.createObjectURL as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce("blob:frame-1")
      .mockReturnValueOnce("blob:frame-2");
    fetchMultimodalBufferMock.mockResolvedValue({
      sceneId: "scene-1",
      window: { startTimeNs: 0, endTimeNs: 2_999_999_999 },
      streams: [
        {
          streamId: "/camera/front",
          schemaName: "sensor_msgs/msg/CompressedImage",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "frame-1",
              logTimeNs: 1_000_000_000,
              publishTimeNs: 1_000_000_010,
              payload: Uint8Array.from([1, 2, 3]),
            },
            {
              messageId: "frame-2",
              logTimeNs: 2_000_000_000,
              publishTimeNs: 2_000_000_010,
              payload: Uint8Array.from([4, 5, 6]),
            },
          ],
        },
      ],
    });
    decodeCompressedImageInWorkerMock
      .mockResolvedValueOnce({
        messageId: "frame-1",
        format: "jpeg",
        frameId: "camera",
        compressedBytes: Uint8Array.from([1, 2, 3]),
      })
      .mockResolvedValueOnce({
        messageId: "frame-2",
        format: "jpeg",
        frameId: "camera",
        compressedBytes: Uint8Array.from([4, 5, 6]),
      });

    const cache = new MultimodalImageBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/camera/front",
      mediaField: "filepath",
      sceneRange: { startNs: 0, endNs: 9_000_000_000 },
      maxDecodedFrameEntries: 1,
    });

    await cache.ensureRange({
      startNs: 1_000_000_000,
      endNs: 2_000_000_000,
    });

    await cache.decodeMessage(cache.getMessageForLogTime(1_000_000_000)!);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    await cache.decodeMessage(cache.getMessageForLogTime(2_000_000_000)!);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:frame-1");

    cache.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:frame-2");
  });
});
