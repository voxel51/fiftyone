/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMcapBuffer, fetchMcapScene } from "./api";

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

  it("fetches the scene-open payload from the sample-scoped route", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      scene: {
        sceneId: "scene-1",
        datasetId: "dataset-1",
        sampleId: "sample-1",
        mediaField: "mcap_path",
        mediaPath: "/tmp/test.mcap",
        timeRange: { startNs: 1, endNs: 2 },
        streams: [],
      },
      playbackPlan: {
        sceneId: "scene-1",
        sync: {
          timestampSource: "header.stamp",
          fallback: "log_time",
          mode: "nearest",
        },
        panels: [],
        sidebars: {
          left: "panel_config",
          right: "stream_metadata",
        },
      },
    });
    getFetchFunctionMock.mockReturnValue(fetchSpy);

    const response = await fetchMcapScene({
      datasetId: "dataset/1",
      sampleId: "sample/1",
      mediaField: "mcap_path",
    });

    expect(getFetchFunctionMock).toHaveBeenCalledWith({ cache: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "GET",
      "/dataset/dataset%2F1/sample/sample%2F1/mcap/scene?media_field=mcap_path"
    );
    expect(response.scene.sceneId).toBe("scene-1");
  });

  it("normalizes raw buffer payloads into Uint8Array values", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      mode: "raw",
      sceneId: "scene-1",
      window: { startNs: 10, endNs: 20 },
      streams: [
        {
          streamId: "/lidar/top",
          schemaName: "sensor_msgs/msg/PointCloud2",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "msg-1",
              logTimeNs: 10,
              publishTimeNs: 12,
              payloadB64: "AQID",
            },
          ],
        },
      ],
    });
    getFetchFunctionMock.mockReturnValue(fetchSpy);

    const response = await fetchMcapBuffer({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      request: {
        mediaField: "mcap_path",
        streamIds: ["/lidar/top"],
        window: { startNs: 10, endNs: 20 },
        mode: "raw",
      },
    });

    expect(getFetchFunctionMock).toHaveBeenCalledWith();
    expect(fetchSpy).toHaveBeenCalledWith(
      "POST",
      "/dataset/dataset-1/sample/sample-1/mcap/buffer",
      {
        mediaField: "mcap_path",
        streamIds: ["/lidar/top"],
        window: { startNs: 10, endNs: 20 },
        mode: "raw",
      }
    );
    expect(response.streams[0].messages[0].payload).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });
});
