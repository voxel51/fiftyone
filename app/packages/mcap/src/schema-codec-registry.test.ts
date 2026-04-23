import { afterEach, describe, expect, it, vi } from "vitest";

const {
  decodeCompressedImageInWorkerMock,
  disposeCompressedImageWorkerClientMock,
  decodePointCloud2InWorkerMock,
  disposePointCloud2WorkerClientMock,
} = vi.hoisted(() => ({
  decodeCompressedImageInWorkerMock: vi.fn(),
  disposeCompressedImageWorkerClientMock: vi.fn(),
  decodePointCloud2InWorkerMock: vi.fn(),
  disposePointCloud2WorkerClientMock: vi.fn(),
}));

vi.mock("./compressed-image-worker-client", () => ({
  decodeCompressedImageInWorker: decodeCompressedImageInWorkerMock,
  disposeCompressedImageWorkerClient: disposeCompressedImageWorkerClientMock,
}));

vi.mock("./pointcloud2-worker-client", () => ({
  decodePointCloud2InWorker: decodePointCloud2InWorkerMock,
  disposePointCloud2WorkerClient: disposePointCloud2WorkerClientMock,
}));

describe("schema-codec-registry", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("routes foxglove compressed images through the worker-backed image codec", async () => {
    decodeCompressedImageInWorkerMock.mockResolvedValue({
      messageId: "image-1",
      format: "jpeg",
      frameId: "camera",
      compressedBytes: Uint8Array.from([1, 2, 3]),
    });
    const { BUILTIN_SCHEMA_CODEC_REGISTRY } = await import(
      "./schema-codec-registry"
    );

    const decoded = await BUILTIN_SCHEMA_CODEC_REGISTRY.decodeImageMessage(
      "foxglove.CompressedImage",
      {
        messageId: "image-1",
        logTimeNs: 10,
        publishTimeNs: 11,
        syncTimestampNs: 10,
        payload: Uint8Array.from([1, 2, 3]),
      }
    );

    expect(decodeCompressedImageInWorkerMock).toHaveBeenCalledWith({
      messageId: "image-1",
      schemaName: "foxglove.CompressedImage",
      payload: expect.any(ArrayBuffer),
    });
    expect(decoded.frameId).toBe("camera");
    expect(decoded.format).toBe("jpeg");
  });

  it("routes foxglove point clouds through the worker-backed 3D codec", async () => {
    decodePointCloud2InWorkerMock.mockResolvedValue({
      messageId: "cloud-1",
      frame: {
        id: "cloud-1",
        pointCount: 1,
        bounds: {
          min: [0, 0, 0] as [number, number, number],
          max: [1, 1, 1] as [number, number, number],
        },
        frameId: "lidar",
        primitives: [
          {
            kind: "points",
            id: "points",
            frameId: "lidar",
            pointCount: 1,
            positions: new Float32Array([0, 0, 0]),
            intensity: null,
            colors: null,
            solidColor: null,
            pointSize: null,
          },
        ],
      },
    });
    const { BUILTIN_SCHEMA_CODEC_REGISTRY } = await import(
      "./schema-codec-registry"
    );

    const decoded = await BUILTIN_SCHEMA_CODEC_REGISTRY.decodeScene3dMessage(
      "foxglove.PointCloud",
      {
        messageId: "cloud-1",
        logTimeNs: 10,
        publishTimeNs: 11,
        syncTimestampNs: 10,
        payload: Uint8Array.from([1, 2, 3]),
      }
    );

    expect(decodePointCloud2InWorkerMock).toHaveBeenCalledWith({
      messageId: "cloud-1",
      schemaName: "foxglove.PointCloud",
      payload: expect.any(ArrayBuffer),
    });
    expect(decoded.frame.frameId).toBe("lidar");
    expect(decoded.frame.pointCount).toBe(1);
  });
});
