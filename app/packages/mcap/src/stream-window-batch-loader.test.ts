/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createMultimodalStreamWindowBatchLoader } from "./stream-window-batch-loader";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe("createMultimodalStreamWindowBatchLoader", () => {
  it("batches same-window requests across streams into one fetch", async () => {
    const loadBuffer = vi.fn(async (params: any) => ({
      sceneId: "scene-1",
      window: {
        startTimeNs: params.request.startTimeNs,
        endTimeNs: params.request.endTimeNs,
      },
      streams: params.request.streamIds.map((streamId: string) => ({
        streamId,
        schemaName: "schema",
        messageEncoding: "cdr",
        messages: [],
      })),
    }));
    const loadWindow = createMultimodalStreamWindowBatchLoader({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      mediaField: "filepath",
      sourceKind: "mcap",
      loadBuffer,
    });

    const [imageStream, renderStream] = await Promise.all([
      loadWindow("/camera/front", { startNs: 10, endNs: 20 }),
      loadWindow("/lidar/top", { startNs: 10, endNs: 20 }),
    ]);

    expect(loadBuffer).toHaveBeenCalledTimes(1);
    expect(loadBuffer).toHaveBeenCalledWith({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      request: {
        mediaField: "filepath",
        sourceKind: "mcap",
        streamIds: ["/camera/front", "/lidar/top"],
        startTimeNs: 10,
        endTimeNs: 20,
        mode: "raw",
      },
    });
    expect(imageStream?.streamId).toBe("/camera/front");
    expect(renderStream?.streamId).toBe("/lidar/top");
  });

  it("dedupes repeated in-flight requests for the same stream window", async () => {
    const deferred = createDeferred<any>();
    const loadBuffer = vi.fn(() => deferred.promise);
    const loadWindow = createMultimodalStreamWindowBatchLoader({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      mediaField: "filepath",
      loadBuffer,
    });

    const firstLoad = loadWindow("/camera/front", { startNs: 10, endNs: 20 });
    const secondLoad = loadWindow("/camera/front", { startNs: 10, endNs: 20 });
    await Promise.resolve();

    expect(loadBuffer).toHaveBeenCalledTimes(1);

    deferred.resolve({
      sceneId: "scene-1",
      window: {
        startTimeNs: 10,
        endTimeNs: 20,
      },
      streams: [
        {
          streamId: "/camera/front",
          schemaName: "sensor_msgs/msg/CompressedImage",
          messageEncoding: "cdr",
          messages: [],
        },
      ],
    });

    const [firstResult, secondResult] = await Promise.all([
      firstLoad,
      secondLoad,
    ]);
    expect(firstResult).toBe(secondResult);
  });
});
