/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getFetchFunctionMock,
  getFetchFunctionExtendedMock,
  decodeRawBufferBatchInWorkerMock,
} = vi.hoisted(() => {
  return {
    getFetchFunctionMock: vi.fn(),
    getFetchFunctionExtendedMock: vi.fn(),
    decodeRawBufferBatchInWorkerMock: vi.fn(),
  };
});

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: getFetchFunctionMock,
  getFetchFunctionExtended: getFetchFunctionExtendedMock,
}));

vi.mock("./raw-buffer-batch-worker-client", () => ({
  decodeRawBufferBatchInWorker: decodeRawBufferBatchInWorkerMock,
}));

const BINARY_CONTENT_TYPE = "application/x-fiftyone-multimodal-raw-buffer";

function buildBinaryRawBufferResponse(
  manifest: Record<string, unknown>,
  payloadBytes: Uint8Array
) {
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const responseBytes = new Uint8Array(
    9 + manifestBytes.byteLength + payloadBytes.byteLength
  );

  responseBytes.set(
    Uint8Array.from([
      "M".charCodeAt(0),
      "M".charCodeAt(0),
      "R".charCodeAt(0),
      "B".charCodeAt(0),
      1,
    ]),
    0
  );
  new DataView(responseBytes.buffer).setUint32(
    5,
    manifestBytes.byteLength,
    true
  );
  responseBytes.set(manifestBytes, 9);
  responseBytes.set(payloadBytes, 9 + manifestBytes.byteLength);

  return responseBytes.buffer;
}

describe("mcap api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("fetches the workspace payload from the sample-scoped route", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      catalog: {
        sceneId: "scene-1",
        datasetId: "dataset-1",
        sampleId: "sample-1",
        mediaField: "mcap_path",
        mediaPath: "/tmp/test.mcap",
        sourceKind: "mcap",
        catalogVersion: "multimodal-workspace-v4",
        timeRange: { startNs: 1, endNs: 2 },
        streams: [],
        frames: [],
        transforms: [],
        locationTopics: [],
      },
      renderingPlan: {
        sceneId: "scene-1",
        mediaField: "mcap_path",
        sourceKind: "mcap",
        sync: {
          timestampSource: "header.stamp",
          fallback: "log_time",
          mode: "nearest",
        },
        panels: [],
        layoutTree: null,
      },
    });
    getFetchFunctionMock.mockReturnValue(fetchSpy);

    const { fetchMultimodalWorkspace } = await import("./api");
    const response = await fetchMultimodalWorkspace({
      datasetId: "dataset/1",
      sampleId: "sample/1",
      mediaField: "mcap_path",
    });

    expect(getFetchFunctionMock).toHaveBeenCalledWith({ cache: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "GET",
      "/dataset/dataset%2F1/sample/sample%2F1/multimodal/workspace?mediaField=mcap_path"
    );
    expect(response.catalog.sceneId).toBe("scene-1");
  });

  it("saves the rendering plan to the sample-scoped workspace route", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      sceneId: "scene-1",
      mediaField: "mcap_path",
      sourceKind: "mcap",
      sync: {
        timestampSource: "header.stamp",
        fallback: "log_time",
        mode: "nearest",
      },
      panels: [],
      layoutTree: null,
    });
    getFetchFunctionMock.mockReturnValue(fetchSpy);

    const renderingPlan = {
      sceneId: "scene-1",
      mediaField: "mcap_path",
      sourceKind: "mcap",
      sync: {
        timestampSource: "header.stamp",
        fallback: "log_time",
        mode: "nearest",
      },
      panels: [],
      layoutTree: null,
    } as const;

    const { saveMultimodalWorkspace } = await import("./api");
    const response = await saveMultimodalWorkspace({
      datasetId: "dataset/1",
      sampleId: "sample/1",
      renderingPlan,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "PATCH",
      "/dataset/dataset%2F1/sample/sample%2F1/multimodal/workspace",
      renderingPlan
    );
    expect(response.layoutTree).toBeNull();
  });

  it("prefers the binary stream-window transport and materializes prefetched image decodes", async () => {
    const manifest = {
      sceneId: "scene-1",
      window: { startTimeNs: 10, endTimeNs: 20 },
      streams: [
        {
          streamId: "/camera/front",
          schemaName: "sensor_msgs/msg/CompressedImage",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "msg-1",
              syncTimestampNs: 10,
              logTimeNs: 10,
              publishTimeNs: 12,
              payloadOffset: 0,
              payloadLength: 3,
            },
          ],
        },
      ],
    };
    const binaryFetchSpy = vi.fn().mockResolvedValue({
      headers: new Headers({ "content-type": BINARY_CONTENT_TYPE }),
      response: buildBinaryRawBufferResponse(
        manifest,
        Uint8Array.from([1, 2, 3])
      ),
    });
    getFetchFunctionExtendedMock.mockReturnValue(binaryFetchSpy);
    decodeRawBufferBatchInWorkerMock.mockImplementation(
      async ({ payloadBuffer }: { payloadBuffer: ArrayBuffer }) => ({
        payloadBuffer,
        decodedImages: [
          {
            messageId: "msg-1",
            format: "jpeg",
            frameId: "camera",
            compressedBytes: Uint8Array.from([9, 8, 7]).buffer,
            compressedBytesByteOffset: 0,
            compressedBytesByteLength: 3,
          },
        ],
        decodedScenes: [],
      })
    );

    const { fetchMultimodalBuffer } = await import("./api");
    const response = await fetchMultimodalBuffer({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      request: {
        mediaField: "mcap_path",
        streamIds: ["/camera/front"],
        startTimeNs: 10,
        endTimeNs: 20,
      },
    });

    expect(binaryFetchSpy).toHaveBeenCalledWith({
      method: "POST",
      path: "/dataset/dataset-1/sample/sample-1/multimodal/stream-window-binary",
      body: {
        mediaField: "mcap_path",
        streamIds: ["/camera/front"],
        startTimeNs: 10,
        endTimeNs: 20,
        mode: "raw",
      },
      result: "arrayBuffer",
    });
    expect(decodeRawBufferBatchInWorkerMock).toHaveBeenCalledWith({
      batch: {
        sceneId: "scene-1",
        window: { startTimeNs: 10, endTimeNs: 20 },
        streams: manifest.streams,
        payloadBaseOffset: expect.any(Number),
      },
      payloadBuffer: expect.any(ArrayBuffer),
    });
    expect(response.streams[0].messages[0].payload).toEqual(new Uint8Array([]));
    expect(response.streams[0].prefetchedImageMessages).toEqual([
      {
        messageId: "msg-1",
        format: "jpeg",
        frameId: "camera",
        compressedBytes: new Uint8Array([9, 8, 7]),
      },
    ]);
  });

  it("fetches the bootstrap raw window over binary transport and preserves non-hot payload bytes", async () => {
    const manifest = {
      sceneId: "scene-1",
      window: { startTimeNs: 0, endTimeNs: 100 },
      streams: [
        {
          streamId: "/tf",
          schemaName: "tf2_msgs/msg/TFMessage",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "tf-1",
              syncTimestampNs: 10,
              logTimeNs: 10,
              publishTimeNs: 12,
              payloadOffset: 0,
              payloadLength: 3,
            },
          ],
        },
      ],
    };
    const binaryFetchSpy = vi.fn().mockResolvedValue({
      headers: new Headers({ "content-type": BINARY_CONTENT_TYPE }),
      response: buildBinaryRawBufferResponse(
        manifest,
        Uint8Array.from([1, 2, 3])
      ),
    });
    getFetchFunctionExtendedMock.mockReturnValue(binaryFetchSpy);
    decodeRawBufferBatchInWorkerMock.mockImplementation(
      async ({ payloadBuffer }: { payloadBuffer: ArrayBuffer }) => ({
        payloadBuffer,
        decodedImages: [],
        decodedScenes: [],
      })
    );

    const { fetchMultimodalBootstrapWindow } = await import("./api");
    const response = await fetchMultimodalBootstrapWindow({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      request: {
        mediaField: "mcap_path",
        anchorTimeNs: 0,
        renderStreamIds: ["/lidar/top"],
        transformStreamIds: ["/tf"],
        locationStreamIds: [],
        transformWindowNs: 100,
      },
    });

    expect(binaryFetchSpy).toHaveBeenCalledWith({
      method: "POST",
      path: "/dataset/dataset-1/sample/sample-1/multimodal/bootstrap-window-binary",
      body: {
        mediaField: "mcap_path",
        anchorTimeNs: 0,
        renderStreamIds: ["/lidar/top"],
        transformStreamIds: ["/tf"],
        locationStreamIds: [],
        transformWindowNs: 100,
      },
      result: "arrayBuffer",
    });
    expect(response.streams[0].messages[0].syncTimestampNs).toBe(10);
    expect(response.streams[0].messages[0].payload).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it("fetches the shared playback timeline from the sample-scoped route", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      sceneId: "scene-1",
      timestampSource: "header.stamp",
      timestampsNs: [10, 20],
      streams: [
        {
          streamId: "/camera/front",
          samples: [
            {
              timestampNs: 10,
              logTimeNs: 100,
              publishTimeNs: 101,
            },
            {
              timestampNs: 20,
              logTimeNs: 200,
              publishTimeNs: 201,
            },
          ],
        },
      ],
    });
    getFetchFunctionMock.mockReturnValue(fetchSpy);

    const { fetchMultimodalTimeline } = await import("./api");
    const response = await fetchMultimodalTimeline({
      datasetId: "dataset/1",
      sampleId: "sample/1",
      request: {
        mediaField: "mcap_path",
        streamIds: ["/camera/front"],
        timestampSource: "header.stamp",
        fallback: "log_time",
      },
    });

    expect(getFetchFunctionMock).toHaveBeenCalledWith({ cache: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "POST",
      "/dataset/dataset%2F1/sample/sample%2F1/multimodal/timeline-index",
      {
        mediaField: "mcap_path",
        streamIds: ["/camera/front"],
        timestampSource: "header.stamp",
        fallback: "log_time",
      }
    );
    expect(response.timestampsNs).toEqual([10, 20]);
  });
});
