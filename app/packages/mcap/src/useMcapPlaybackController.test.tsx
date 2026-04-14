/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMcapPlaybackController } from "./useMcapPlaybackController";

const subscriptions: Array<{
  id: string;
  loadRange: (range: [number, number]) => Promise<void>;
  renderFrame: (frameNumber: number) => void;
}> = [];

const {
  useCreateTimelineMock,
  useMcapTimelineIndexMock,
  imageCacheConstructorMock,
  pointCloudCacheConstructorMock,
  imageCacheInstance,
  pointCloudCacheInstance,
} = vi.hoisted(() => {
  const imageCacheInstance = {
    ensureRange: vi.fn(async () => {}),
    getMessageForLogTime: vi.fn((timestampNs: number) => {
      if (timestampNs === 10) {
        return {
          messageId: "frame-1",
          logTimeNs: 10,
          publishTimeNs: 11,
          payload: new Uint8Array([1]),
        };
      }

      return null;
    }),
    decodeMessage: vi.fn(async () => ({
      id: "frame-1",
      messageId: "frame-1",
      src: "blob:frame-1",
      timestampNs: 10,
      format: "jpeg",
      logTimeNs: 10,
      publishTimeNs: 11,
      objectUrl: "blob:frame-1",
    })),
    dispose: vi.fn(),
  };
  const pointCloudCacheInstance = {
    ensureRange: vi.fn(async () => {}),
    getMessageForLogTime: vi.fn((timestampNs: number) => {
      if (timestampNs === 20) {
        return {
          messageId: "cloud-1",
          logTimeNs: 20,
          publishTimeNs: 21,
          payload: new Uint8Array([2]),
        };
      }

      return null;
    }),
    decodeMessage: vi.fn(async () => ({
      id: "cloud-1",
      messageId: "cloud-1",
      pointCount: 2,
      positions: new Float32Array([0, 0, 0, 1, 1, 1]),
      intensity: new Float32Array([0.1, 0.9]),
      bounds: {
        min: [0, 0, 0] as [number, number, number],
        max: [1, 1, 1] as [number, number, number],
      },
      logTimeNs: 20,
      publishTimeNs: 21,
    })),
    dispose: vi.fn(),
  };

  return {
    useCreateTimelineMock: vi.fn(() => ({
      isTimelineInitialized: true,
      subscribe: vi.fn((subscription) => {
        subscriptions.push(subscription);
      }),
    })),
    useMcapTimelineIndexMock: vi.fn(),
    imageCacheConstructorMock: vi.fn(() => imageCacheInstance),
    pointCloudCacheConstructorMock: vi.fn(() => pointCloudCacheInstance),
    imageCacheInstance,
    pointCloudCacheInstance,
  };
});

vi.mock("@fiftyone/playback", () => ({
  useCreateTimeline: useCreateTimelineMock,
}));

vi.mock("./useMcapTimelineIndex", () => ({
  useMcapTimelineIndex: useMcapTimelineIndexMock,
}));

vi.mock("./image-buffer-cache", () => ({
  McapImageBufferCache: imageCacheConstructorMock,
}));

vi.mock("./pointcloud-buffer-cache", () => ({
  McapPointCloudBufferCache: pointCloudCacheConstructorMock,
}));

const SCENE = {
  sceneId: "scene-1",
  datasetId: "dataset-1",
  sampleId: "sample-1",
  mediaField: "filepath",
  mediaPath: "/tmp/run.mcap",
  timeRange: { startNs: 10, endNs: 30 },
  streams: [],
} as const;

const PLAYBACK_PLAN = {
  sceneId: "scene-1",
  sync: {
    timestampSource: "header.stamp",
    fallback: "log_time",
    mode: "nearest",
  },
  panels: [
    {
      panelId: "camera_front",
      panelType: "2d",
      contentType: "image",
      streamId: "/camera/front",
    },
    {
      panelId: "lidar_top",
      panelType: "3d",
      contentType: "pointcloud",
      streamId: "/lidar/top",
    },
  ],
  sidebars: {
    left: "panel_config",
    right: "stream_metadata",
  },
} as const;

describe("useMcapPlaybackController", () => {
  beforeEach(() => {
    subscriptions.length = 0;
    vi.clearAllMocks();
    useMcapTimelineIndexMock.mockReturnValue({
      timeline: {
        timestampSource: "log_time",
        timestampsNs: [10, 20, 30],
        streams: [
          {
            streamId: "/camera/front",
            timestampsNs: [10, 30],
          },
          {
            streamId: "/lidar/top",
            timestampsNs: [20, 30],
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("subscribes both image and pointcloud panels to the same timeline", async () => {
    const { result } = renderHook(() =>
      useMcapPlaybackController(SCENE as any, PLAYBACK_PLAN as any)
    );

    await waitFor(() => {
      expect(subscriptions).toHaveLength(2);
    });

    expect(result.current.timelineName).toBe("mcap:scene-1");
    expect(result.current.hasPlayback).toBe(true);
  });

  it("renders image and pointcloud panels from the shared playback cursor", async () => {
    const { result } = renderHook(() =>
      useMcapPlaybackController(SCENE as any, PLAYBACK_PLAN as any)
    );

    await waitFor(() => {
      expect(subscriptions).toHaveLength(2);
    });

    await subscriptions[0].loadRange([1, 2]);
    await subscriptions[1].loadRange([1, 2]);
    await subscriptions[0].renderFrame(2);
    await subscriptions[1].renderFrame(2);

    await waitFor(() => {
      expect(result.current.panelStates.camera_front.status).toBe("ready");
      expect(result.current.panelStates.lidar_top.status).toBe("ready");
    });

    expect(imageCacheInstance.getMessageForLogTime).toHaveBeenCalledWith(10);
    expect(pointCloudCacheInstance.getMessageForLogTime).toHaveBeenCalledWith(
      20
    );
    expect(result.current.panelStates.camera_front.messageId).toBe("frame-1");
    expect(result.current.panelStates.lidar_top.messageId).toBe("cloud-1");
  });
});
