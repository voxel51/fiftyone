import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultimodalRenderable3dBufferCache } from "./renderable3d-buffer-cache";

const { decodeScene3dMessageMock, disposeScene3dResourcesMock } = vi.hoisted(
  () => ({
    decodeScene3dMessageMock: vi.fn(async () => ({
      frame: {
        id: "cloud-1",
        pointCount: 1,
        bounds: {
          min: [0, 0, 0] as [number, number, number],
          max: [0, 0, 0] as [number, number, number],
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
      warnings: [],
    })),
    disposeScene3dResourcesMock: vi.fn(),
  })
);

vi.mock("./schema-codec-registry", () => ({
  BUILTIN_SCHEMA_CODEC_REGISTRY: {
    decodeScene3dMessage: decodeScene3dMessageMock,
    disposeScene3dResources: disposeScene3dResourcesMock,
  },
}));

describe("MultimodalRenderable3dBufferCache", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("memoizes transformed frames by target frame and TF revision", async () => {
    const cache = new MultimodalRenderable3dBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/lidar/top",
      schemaName: "sensor_msgs/msg/PointCloud2",
      mediaField: "filepath",
      sourceKind: "mcap",
      sceneRange: { startNs: 0, endNs: 100 },
    });
    const resolveTransformMatrix = vi.fn(() =>
      new THREE.Matrix4().makeTranslation(1, 2, 3)
    );
    const message = {
      messageId: "cloud-1",
      logTimeNs: 10,
      publishTimeNs: 10,
      syncTimestampNs: 10,
      payload: new Uint8Array([1]),
    };

    const firstFrame = await cache.decodeMessageInFrame(message as any, {
      targetFrameId: "map",
      transformRevision: 1,
      resolveTransformMatrix,
      warningContext: "/lidar/top",
    });
    const secondFrame = await cache.decodeMessageInFrame(message as any, {
      targetFrameId: "map",
      transformRevision: 1,
      resolveTransformMatrix,
      warningContext: "/lidar/top",
    });

    expect(Array.from(firstFrame.primitives[0].positions)).toEqual([1, 2, 3]);
    expect(secondFrame).toBe(firstFrame);
    expect(resolveTransformMatrix).toHaveBeenCalledTimes(1);

    await cache.decodeMessageInFrame(message as any, {
      targetFrameId: "map",
      transformRevision: 2,
      resolveTransformMatrix,
      warningContext: "/lidar/top",
    });

    expect(resolveTransformMatrix).toHaveBeenCalledTimes(2);

    cache.dispose();
  });

  it("derives stable primitive ids from the stream instead of the message id", async () => {
    const cache = new MultimodalRenderable3dBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/lidar/top",
      schemaName: "sensor_msgs/msg/PointCloud2",
      mediaField: "filepath",
      sourceKind: "mcap",
      sceneRange: { startNs: 0, endNs: 100 },
    });
    const firstMessage = {
      messageId: "cloud-1",
      logTimeNs: 10,
      publishTimeNs: 10,
      syncTimestampNs: 10,
      payload: new Uint8Array([1]),
    };
    const secondMessage = {
      messageId: "cloud-2",
      logTimeNs: 20,
      publishTimeNs: 20,
      syncTimestampNs: 20,
      payload: new Uint8Array([2]),
    };

    const firstFrame = await cache.decodeMessage(firstMessage as any);
    const secondFrame = await cache.decodeMessage(secondMessage as any);

    expect(firstFrame.primitives[0].id).toBe("/lidar/top:points:0");
    expect(secondFrame.primitives[0].id).toBe("/lidar/top:points:0");

    cache.dispose();
  });

  it("reuses prefetched point-cloud frames from binary transport without re-decoding them", async () => {
    const cache = new MultimodalRenderable3dBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/lidar/top",
      schemaName: "sensor_msgs/msg/PointCloud2",
      mediaField: "filepath",
      sourceKind: "mcap",
      sceneRange: { startNs: 0, endNs: 100 },
    });
    const stream = {
      streamId: "/lidar/top",
      schemaName: "sensor_msgs/msg/PointCloud2",
      messageEncoding: "cdr",
      messages: [
        {
          messageId: "cloud-1",
          logTimeNs: 10,
          publishTimeNs: 10,
          syncTimestampNs: 10,
          payload: new Uint8Array(),
        },
      ],
      prefetchedSceneMessages: [
        {
          messageId: "cloud-1",
          frame: {
            id: "cloud-1",
            pointCount: 1,
            bounds: {
              min: [0, 0, 0] as [number, number, number],
              max: [0, 0, 0] as [number, number, number],
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
        },
      ],
    };

    cache.primeStream(stream, { startNs: 0, endNs: 100 });

    const frame = await cache.decodeMessage(stream.messages[0] as any);

    expect(decodeScene3dMessageMock).not.toHaveBeenCalled();
    expect(frame.primitives[0].id).toBe("/lidar/top:points:0");

    cache.dispose();
  });

  it("evicts least-recently-used decoded frames when the cache reaches capacity", async () => {
    decodeScene3dMessageMock.mockImplementation(
      async (_schemaName: string, message: { messageId: string }) => ({
        frame: {
          id: message.messageId,
          pointCount: 1,
          bounds: {
            min: [0, 0, 0] as [number, number, number],
            max: [0, 0, 0] as [number, number, number],
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
        warnings: [],
      })
    );
    const cache = new MultimodalRenderable3dBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/lidar/top",
      schemaName: "sensor_msgs/msg/PointCloud2",
      mediaField: "filepath",
      sourceKind: "mcap",
      sceneRange: { startNs: 0, endNs: 100 },
      maxDecodedFrameEntries: 1,
    });
    const firstMessage = {
      messageId: "cloud-1",
      logTimeNs: 10,
      publishTimeNs: 10,
      syncTimestampNs: 10,
      payload: new Uint8Array([1]),
    };
    const secondMessage = {
      messageId: "cloud-2",
      logTimeNs: 20,
      publishTimeNs: 20,
      syncTimestampNs: 20,
      payload: new Uint8Array([2]),
    };

    await cache.decodeMessage(firstMessage as any);
    await cache.decodeMessage(secondMessage as any);
    await cache.decodeMessage(firstMessage as any);

    expect(decodeScene3dMessageMock).toHaveBeenCalledTimes(3);

    cache.dispose();
  });

  it("preserves bounds and point counts when primitives already match the target frame", async () => {
    decodeScene3dMessageMock.mockResolvedValue({
      frame: {
        id: "cloud-1",
        pointCount: 2,
        bounds: {
          min: [1, 2, 3] as [number, number, number],
          max: [4, 5, 6] as [number, number, number],
        },
        frameId: "map",
        primitives: [
          {
            kind: "points",
            id: "points",
            frameId: "map",
            pointCount: 2,
            positions: new Float32Array([1, 2, 3, 4, 5, 6]),
            intensity: null,
            colors: null,
            solidColor: null,
            pointSize: null,
          },
        ],
      },
      warnings: [],
    });
    const cache = new MultimodalRenderable3dBufferCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/lidar/top",
      schemaName: "sensor_msgs/msg/PointCloud2",
      mediaField: "filepath",
      sourceKind: "mcap",
      sceneRange: { startNs: 0, endNs: 100 },
    });
    const resolveTransformMatrix = vi.fn(() =>
      new THREE.Matrix4().makeTranslation(10, 0, 0)
    );
    const message = {
      messageId: "cloud-1",
      logTimeNs: 10,
      publishTimeNs: 10,
      syncTimestampNs: 10,
      payload: new Uint8Array([1]),
    };

    const frame = await cache.decodeMessageInFrame(message as any, {
      targetFrameId: "map",
      transformRevision: 1,
      resolveTransformMatrix,
      warningContext: "/lidar/top",
    });

    expect(frame.pointCount).toBe(2);
    expect(frame.bounds).toEqual({
      min: [1, 2, 3],
      max: [4, 5, 6],
    });
    expect(resolveTransformMatrix).not.toHaveBeenCalled();

    cache.dispose();
  });
});
