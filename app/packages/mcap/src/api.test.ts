/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchMultimodalBootstrapWindow,
  fetchMultimodalBuffer,
  fetchMultimodalTimeline,
  fetchMultimodalWorkspace,
} from "./api";

const { getFetchFunctionMock } = vi.hoisted(() => ({
  getFetchFunctionMock: vi.fn(),
}));

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: getFetchFunctionMock,
}));

describe("mcap api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        catalogVersion: "multimodal-workspace-v1",
        timeRange: { startNs: 1, endNs: 2 },
        streams: [],
        frames: [],
        transforms: [],
        locationTopics: [],
      },
      renderingPlan: {
        sceneId: "scene-1",
        mediaField: "mcap_path",
        sync: {
          timestampSource: "header.stamp",
          fallback: "log_time",
          mode: "nearest",
        },
        panels: [],
      },
    });
    getFetchFunctionMock.mockReturnValue(fetchSpy);

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

  it("normalizes raw buffer payloads into Uint8Array values", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      sceneId: "scene-1",
      window: { startTimeNs: 10, endTimeNs: 20 },
      streams: [
        {
          streamId: "/lidar/top",
          schemaName: "sensor_msgs/msg/PointCloud2",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "msg-1",
              syncTimestampNs: 10,
              logTimeNs: 10,
              publishTimeNs: 12,
              payloadB64: "AQID",
            },
          ],
        },
      ],
    });
    getFetchFunctionMock.mockReturnValue(fetchSpy);

    const response = await fetchMultimodalBuffer({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      request: {
        mediaField: "mcap_path",
        streamIds: ["/lidar/top"],
        startTimeNs: 10,
        endTimeNs: 20,
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "POST",
      "/dataset/dataset-1/sample/sample-1/multimodal/stream-window",
      {
        mediaField: "mcap_path",
        streamIds: ["/lidar/top"],
        startTimeNs: 10,
        endTimeNs: 20,
        mode: "raw",
      }
    );
    expect(response.streams[0].messages[0].payload).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it("fetches the bootstrap raw window from the sample-scoped route", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      sceneId: "scene-1",
      window: { startTimeNs: 0, endTimeNs: 100 },
      streams: [
        {
          streamId: "/lidar/top",
          schemaName: "sensor_msgs/msg/PointCloud2",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "msg-1",
              syncTimestampNs: 10,
              logTimeNs: 10,
              publishTimeNs: 12,
              payloadB64: "AQID",
            },
          ],
        },
      ],
    });
    getFetchFunctionMock.mockReturnValue(fetchSpy);

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

    expect(fetchSpy).toHaveBeenCalledWith(
      "POST",
      "/dataset/dataset-1/sample/sample-1/multimodal/bootstrap-window",
      {
        mediaField: "mcap_path",
        anchorTimeNs: 0,
        renderStreamIds: ["/lidar/top"],
        transformStreamIds: ["/tf"],
        locationStreamIds: [],
        transformWindowNs: 100,
      }
    );
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
