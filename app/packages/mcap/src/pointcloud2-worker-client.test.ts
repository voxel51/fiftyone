/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  workerInstances,
  decodeMultimodalPointCloudRequestMock,
  MockPointCloudWorker,
} = vi.hoisted(() => {
  const instances: MockPointCloudWorker[] = [];

  class MockPointCloudWorker {
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
    decodeMultimodalPointCloudRequestMock: vi.fn(),
    MockPointCloudWorker,
  };
});

vi.mock("./pointcloud2-worker.ts?worker&inline", () => ({
  default: MockPointCloudWorker,
}));

vi.mock("./pointcloud2-worker", () => ({
  decodeMultimodalPointCloudRequest: decodeMultimodalPointCloudRequestMock,
}));

describe("pointcloud2-worker-client", () => {
  beforeEach(() => {
    workerInstances.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("round-robins point-cloud decodes across a two-worker pool without recloning buffers", async () => {
    vi.stubGlobal("Worker", function Worker() {});
    const { decodePointCloud2InWorker, disposePointCloud2WorkerClient } =
      await import("./pointcloud2-worker-client");
    const payloads = [
      Uint8Array.from([1, 2, 3]).buffer,
      Uint8Array.from([4, 5, 6]).buffer,
      Uint8Array.from([7, 8, 9]).buffer,
    ];

    const decodePromises = payloads.map((payload, index) =>
      decodePointCloud2InWorker({
        messageId: `cloud-${index + 1}`,
        schemaName: "foxglove.PointCloud",
        payload,
      })
    );

    expect(workerInstances).toHaveLength(2);
    expect(workerInstances[0].postMessage).toHaveBeenCalledTimes(2);
    expect(workerInstances[1].postMessage).toHaveBeenCalledTimes(1);

    const firstWorkerCall = workerInstances[0].postMessage.mock.calls[0];
    expect(firstWorkerCall[0].request.payload).toBe(payloads[0]);
    expect(firstWorkerCall[1]).toEqual([payloads[0]]);

    workerInstances.forEach((workerInstance) => {
      workerInstance.postMessage.mock.calls.forEach(([message]) => {
        workerInstance.emitMessage({
          requestId: message.requestId,
          success: true,
          result: {
            messageId: message.request.messageId,
            pointCount: 1,
            positions: new Float32Array([1, 0, 0]).buffer,
            positionsByteOffset: 0,
            positionsByteLength: 3 * Float32Array.BYTES_PER_ELEMENT,
            intensity: null,
            intensityByteOffset: 0,
            intensityByteLength: 0,
            frameId: "lidar",
            bounds: {
              min: [1, 0, 0] as [number, number, number],
              max: [1, 0, 0] as [number, number, number],
            },
          },
        });
      });
    });

    await expect(Promise.all(decodePromises)).resolves.toHaveLength(3);

    disposePointCloud2WorkerClient();
  });

  it("preserves typed-array offsets returned from the worker", async () => {
    vi.stubGlobal("Worker", function Worker() {});
    const { decodePointCloud2InWorker, disposePointCloud2WorkerClient } =
      await import("./pointcloud2-worker-client");

    const decodePromise = decodePointCloud2InWorker({
      messageId: "cloud-5",
      schemaName: "foxglove.PointCloud",
      payload: Uint8Array.from([1, 2, 3]).buffer,
    });
    const postMessageCall = workerInstances[0].postMessage.mock.calls[0];
    const positions = new Float32Array([10, 11, 12, 13, 14, 15]).buffer;
    const intensity = new Float32Array([0, 0.5, 1, 1.5]).buffer;

    workerInstances[0].emitMessage({
      requestId: postMessageCall[0].requestId,
      success: true,
      result: {
        messageId: "cloud-5",
        pointCount: 1,
        positions,
        positionsByteOffset: 3 * Float32Array.BYTES_PER_ELEMENT,
        positionsByteLength: 3 * Float32Array.BYTES_PER_ELEMENT,
        intensity,
        intensityByteOffset: Float32Array.BYTES_PER_ELEMENT,
        intensityByteLength: Float32Array.BYTES_PER_ELEMENT,
        frameId: "lidar",
        bounds: {
          min: [13, 14, 15] as [number, number, number],
          max: [13, 14, 15] as [number, number, number],
        },
      },
    });

    await expect(decodePromise).resolves.toMatchObject({
      frame: {
        primitives: [
          {
            positions: new Float32Array([13, 14, 15]),
            intensity: new Float32Array([0.5]),
          },
        ],
      },
    });

    disposePointCloud2WorkerClient();
  });

  it("falls back to direct decode when workers are unavailable", async () => {
    vi.stubGlobal("Worker", undefined);
    decodeMultimodalPointCloudRequestMock.mockReturnValue({
      messageId: "cloud-4",
      frame: {
        id: "cloud-4",
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
    const { decodePointCloud2InWorker } = await import(
      "./pointcloud2-worker-client"
    );

    const decoded = await decodePointCloud2InWorker({
      messageId: "cloud-4",
      schemaName: "foxglove.PointCloud",
      payload: Uint8Array.from([1, 2, 3]).buffer,
    });

    expect(decodeMultimodalPointCloudRequestMock).toHaveBeenCalledWith({
      messageId: "cloud-4",
      schemaName: "foxglove.PointCloud",
      payload: expect.any(ArrayBuffer),
    });
    expect(decoded.frame.frameId).toBe("lidar");
  });
});
