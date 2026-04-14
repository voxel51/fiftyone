/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McapPointCloudBufferCache } from "./pointcloud-buffer-cache";

const { fetchMcapBufferMock, decodePointCloud2InWorkerMock } = vi.hoisted(
  () => ({
    fetchMcapBufferMock: vi.fn(),
    decodePointCloud2InWorkerMock: vi.fn(),
  })
);

vi.mock("./api", () => ({
  fetchMcapBuffer: fetchMcapBufferMock,
}));

vi.mock("./pointcloud2-worker-client", () => ({
  decodePointCloud2InWorker: decodePointCloud2InWorkerMock,
  disposePointCloud2WorkerClient: vi.fn(),
}));

describe("McapPointCloudBufferCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses buffered windows across overlapping range requests", async () => {
    fetchMcapBufferMock.mockResolvedValue({
      mode: "raw",
      sceneId: "scene-1",
      window: { startNs: 0, endNs: 2_999_999_999 },
      streams: [
        {
          streamId: "/lidar/top",
          schemaName: "sensor_msgs/msg/PointCloud2",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "cloud-1",
              logTimeNs: 1_000_000_000,
              publishTimeNs: 1_000_000_010,
              payload: Uint8Array.from([1, 2, 3]),
            },
          ],
        },
      ],
    });

    const cache = new McapPointCloudBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/lidar/top",
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

    expect(fetchMcapBufferMock).toHaveBeenCalledTimes(1);
    expect(cache.getMessageForLogTime(1_000_000_000)?.messageId).toBe(
      "cloud-1"
    );
  });

  it("decodes point frames once and caches the result", async () => {
    fetchMcapBufferMock.mockResolvedValue({
      mode: "raw",
      sceneId: "scene-1",
      window: { startNs: 0, endNs: 2_999_999_999 },
      streams: [
        {
          streamId: "/lidar/top",
          schemaName: "sensor_msgs/msg/PointCloud2",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "cloud-1",
              logTimeNs: 1_000_000_000,
              publishTimeNs: 1_000_000_010,
              payload: Uint8Array.from([1, 2, 3]),
            },
          ],
        },
      ],
    });
    decodePointCloud2InWorkerMock.mockResolvedValue({
      messageId: "cloud-1",
      frame: {
        id: "cloud-1",
        pointCount: 2,
        positions: new Float32Array([0, 0, 0, 1, 1, 1]),
        intensity: null,
        bounds: {
          min: [0, 0, 0],
          max: [1, 1, 1],
        },
      },
    });

    const cache = new McapPointCloudBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/lidar/top",
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

    expect(decodePointCloud2InWorkerMock).toHaveBeenCalledTimes(1);
    expect(firstFrame.pointCount).toBe(2);
    expect(secondFrame.messageId).toBe("cloud-1");
  });
});
