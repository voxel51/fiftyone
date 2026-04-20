/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMultimodalPlaybackController } from "./useMultimodalPlaybackController";

const {
  useMultimodalExperimentalTimelineMock,
  experimentalTimelineOptionsRef,
  useMultimodalTimelineIndexMock,
  imageCacheConstructorMock,
  renderable3dCacheConstructorMock,
  rawCacheConstructorMock,
  imageCacheInstance,
  renderable3dCacheInstance,
  rawCacheInstance,
  bootstrapFetchMock,
  imageBufferedRef,
  renderable3dBufferedRef,
} = vi.hoisted(() => {
  const imageBufferedRef = { current: false };
  const renderable3dBufferedRef = { current: false };
  const imageCacheInstance = {
    ensureRange: vi.fn(async () => {
      imageBufferedRef.current = true;
    }),
    warmMessagesAroundLogTime: vi.fn(async () => {}),
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
    getMessageReadiness: vi.fn((timestampNs: number) => {
      return imageBufferedRef.current &&
        (timestampNs === 10 || timestampNs === 30)
        ? "ready"
        : "missing";
    }),
    decodeMessage: vi.fn(async () => ({
      id: "frame-1",
      messageId: "frame-1",
      src: "blob:frame-1",
      timestampNs: 10,
      format: "jpeg",
      frameId: "camera",
      logTimeNs: 10,
      publishTimeNs: 11,
      objectUrl: "blob:frame-1",
    })),
    primeMessages: vi.fn(),
    getSyncSamples: vi.fn(() => [
      {
        timestampNs: 10,
        logTimeNs: 10,
        publishTimeNs: 11,
      },
      {
        timestampNs: 30,
        logTimeNs: 30,
        publishTimeNs: 31,
      },
    ]),
    dispose: vi.fn(),
  };
  const renderable3dCacheInstance = {
    ensureRange: vi.fn(async () => {
      renderable3dBufferedRef.current = true;
    }),
    warmMessagesAroundLogTime: vi.fn(async () => {}),
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
    getMessageReadiness: vi.fn((timestampNs: number) => {
      return renderable3dBufferedRef.current &&
        (timestampNs === 20 || timestampNs === 30)
        ? "ready"
        : "missing";
    }),
    decodeMessage: vi.fn(async () => ({
      id: "cloud-1",
      messageId: "cloud-1",
      pointCount: 2,
      bounds: {
        min: [0, 0, 0] as [number, number, number],
        max: [1, 1, 1] as [number, number, number],
      },
      frameId: "map",
      primitives: [
        {
          kind: "points",
          id: "points",
          frameId: "map",
          pointCount: 2,
          positions: new Float32Array([0, 0, 0, 1, 1, 1]),
          intensity: new Float32Array([0.1, 0.9]),
          colors: null,
          solidColor: null,
          pointSize: null,
        },
      ],
      logTimeNs: 20,
      publishTimeNs: 21,
    })),
    primeMessages: vi.fn(),
    getSyncSamples: vi.fn(() => [
      {
        timestampNs: 20,
        logTimeNs: 20,
        publishTimeNs: 21,
      },
      {
        timestampNs: 30,
        logTimeNs: 30,
        publishTimeNs: 31,
      },
    ]),
    dispose: vi.fn(),
  };
  const rawCacheInstance = {
    ensureRange: vi.fn(async () => {}),
    getMessageForLogTime: vi.fn(() => null),
    getMessages: vi.fn(() => []),
    primeMessages: vi.fn(),
    getSyncSamples: vi.fn(() => []),
    dispose: vi.fn(),
  };
  const experimentalTimelineOptionsRef = { current: null as any };
  const bootstrapFetchMock = vi.fn(async () => ({
    sceneId: "scene-1",
    window: { startTimeNs: 0, endTimeNs: 0 },
    streams: [],
  }));

  return {
    useMultimodalExperimentalTimelineMock: vi.fn((options) => {
      experimentalTimelineOptionsRef.current = options;
      return {
        name: options?.name ?? null,
        isInitialized: true,
        hasPlayback: Boolean(options?.name),
        canControlPlayback:
          options?.canControlPlayback ?? Boolean(options?.name),
        playState: "paused",
        currentTimeNs: 0,
        durationNs: options?.durationNs ?? 0,
        speed: 1,
        loaded: [],
        loading: [0, 0],
        play: vi.fn(),
        pause: vi.fn(),
        togglePlay: vi.fn(),
        setSpeed: vi.fn(),
        seekToPercentage: vi.fn(async () => {}),
        seekToTime: vi.fn(async () => {}),
        notifySeekStart: vi.fn(),
        notifySeekEnd: vi.fn(),
        stepForward: vi.fn(async () => {}),
        stepBackward: vi.fn(async () => {}),
      };
    }),
    experimentalTimelineOptionsRef,
    useMultimodalTimelineIndexMock: vi.fn(),
    imageCacheConstructorMock: vi.fn(() => imageCacheInstance),
    renderable3dCacheConstructorMock: vi.fn(() => renderable3dCacheInstance),
    rawCacheConstructorMock: vi.fn(() => rawCacheInstance),
    bootstrapFetchMock,
    imageCacheInstance,
    renderable3dCacheInstance,
    rawCacheInstance,
    imageBufferedRef,
    renderable3dBufferedRef,
  };
});

vi.mock("./useMultimodalExperimentalTimeline", () => ({
  useMultimodalExperimentalTimeline: useMultimodalExperimentalTimelineMock,
}));

vi.mock("./useMultimodalTimelineIndex", () => ({
  useMultimodalTimelineIndex: useMultimodalTimelineIndexMock,
}));

vi.mock("./image-buffer-cache", () => ({
  MultimodalImageBufferCache: imageCacheConstructorMock,
}));

vi.mock("./renderable3d-buffer-cache", () => ({
  MultimodalRenderable3dBufferCache: renderable3dCacheConstructorMock,
}));

vi.mock("./raw-message-window-cache", () => ({
  MultimodalRawMessageWindowCache: rawCacheConstructorMock,
}));

vi.mock("./api", () => ({
  fetchMultimodalBootstrapWindow: bootstrapFetchMock,
}));

const CATALOG = {
  sceneId: "scene-1",
  datasetId: "dataset-1",
  sampleId: "sample-1",
  mediaField: "filepath",
  mediaPath: "/tmp/run.mcap",
  sourceKind: "mcap",
  catalogVersion: "multimodal-workspace-v1",
  timeRange: { startNs: 10, endNs: 30 },
  streams: [
    {
      streamId: "/camera/front",
      topic: "/camera/front",
      schemaName: "sensor_msgs/msg/CompressedImage",
      schemaEncoding: "ros2msg",
      messageEncoding: "cdr",
      kind: "image",
      frameId: "camera",
      affordances: ["image"],
      compatiblePanels: ["image"],
      channelId: 1,
      schemaId: 1,
      timeRange: { startNs: 10, endNs: 30 },
      messageCount: 2,
    },
    {
      streamId: "/lidar/top",
      topic: "/lidar/top",
      schemaName: "sensor_msgs/msg/PointCloud2",
      schemaEncoding: "ros2msg",
      messageEncoding: "cdr",
      kind: "3d",
      frameId: "map",
      affordances: ["pointcloud", "3d"],
      compatiblePanels: ["3d"],
      channelId: 2,
      schemaId: 2,
      timeRange: { startNs: 10, endNs: 30 },
      messageCount: 2,
    },
  ],
  frames: [{ frameId: "camera" }, { frameId: "map" }],
  transforms: [],
  locationTopics: [],
} as const;

const WORKSPACE = {
  sceneId: "scene-1",
  sync: {
    timestampSource: "header.stamp",
    fallback: "log_time",
    mode: "nearest",
  },
  activePanelId: "image_panel_1",
  panels: [
    {
      panelId: "image_panel_1",
      archetype: "image",
      title: "Image panel",
      renderStreamId: "/camera/front",
      visibleStreamIds: [],
      frameConfig: {
        fixedFrameId: null,
        displayFrameId: null,
        followMode: "off",
        locationStreamId: null,
        enuFrameId: null,
      },
      sceneConfig: { upAxis: "z", backgroundColor: "#10151d" },
    },
    {
      panelId: "panel_3d_1",
      archetype: "3d",
      title: "3D panel",
      renderStreamId: null,
      visibleStreamIds: ["/lidar/top"],
      frameConfig: {
        fixedFrameId: "map",
        displayFrameId: "map",
        followMode: "off",
        locationStreamId: null,
        enuFrameId: null,
      },
      sceneConfig: { upAxis: "z", backgroundColor: "#10151d" },
    },
  ],
} as const;

describe("useMultimodalPlaybackController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    experimentalTimelineOptionsRef.current = null;
    imageBufferedRef.current = false;
    renderable3dBufferedRef.current = false;
    bootstrapFetchMock.mockClear();
    useMultimodalTimelineIndexMock.mockReturnValue({
      timeline: {
        sceneId: "scene-1",
        timestampSource: "header.stamp",
        timestampsNs: [10, 20, 30],
        streams: [
          {
            streamId: "/camera/front",
            timestampsNs: [10, 30],
            samples: [
              {
                timestampNs: 10,
                logTimeNs: 10,
                publishTimeNs: 11,
              },
              {
                timestampNs: 30,
                logTimeNs: 30,
                publishTimeNs: 31,
              },
            ],
          },
          {
            streamId: "/lidar/top",
            timestampsNs: [20, 30],
            samples: [
              {
                timestampNs: 20,
                logTimeNs: 20,
                publishTimeNs: 21,
              },
              {
                timestampNs: 30,
                logTimeNs: 30,
                publishTimeNs: 31,
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("subscribes the workspace to a shared timeline", async () => {
    const { result } = renderHook(() =>
      useMultimodalPlaybackController(CATALOG as any, WORKSPACE as any)
    );

    await waitFor(() => {
      expect(experimentalTimelineOptionsRef.current?.name).toBe(
        "multimodal:scene-1"
      );
    });

    expect(result.current.timelineName).toBe("multimodal:scene-1");
    expect(result.current.hasPlayback).toBe(true);
  });

  it("requests the shared timeline only for render streams", async () => {
    const catalog = {
      ...CATALOG,
      streams: [
        ...CATALOG.streams,
        {
          streamId: "/tf",
          topic: "/tf",
          schemaName: "tf2_msgs/msg/TFMessage",
          schemaEncoding: "ros2msg",
          messageEncoding: "cdr",
          kind: "transform",
          frameId: null,
          affordances: ["transforms"],
          compatiblePanels: [],
          channelId: 3,
          schemaId: 3,
          timeRange: { startNs: 10, endNs: 30 },
          messageCount: 2,
        },
        {
          streamId: "/odom",
          topic: "/odom",
          schemaName: "nav_msgs/msg/Odometry",
          schemaEncoding: "ros2msg",
          messageEncoding: "cdr",
          kind: "location",
          frameId: "base_link",
          affordances: ["location", "pose"],
          compatiblePanels: [],
          channelId: 4,
          schemaId: 4,
          timeRange: { startNs: 10, endNs: 30 },
          messageCount: 2,
        },
      ],
      locationTopics: [
        {
          streamId: "/odom",
          topic: "/odom",
          mode: "pose",
          frameId: "base_link",
        },
      ],
    };
    const workspace = {
      ...WORKSPACE,
      panels: WORKSPACE.panels.map((panel) =>
        panel.panelId === "panel_3d_1"
          ? {
              ...panel,
              frameConfig: {
                ...panel.frameConfig,
                followMode: "pose",
                locationStreamId: "/odom",
              },
            }
          : panel
      ),
    };

    renderHook(() =>
      useMultimodalPlaybackController(catalog as any, workspace as any)
    );

    await waitFor(() => {
      expect(useMultimodalTimelineIndexMock).toHaveBeenCalled();
    });

    expect(useMultimodalTimelineIndexMock).toHaveBeenLastCalledWith({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      request: {
        mediaField: "filepath",
        streamIds: ["/camera/front", "/lidar/top"],
        timestampSource: "header.stamp",
        fallback: "log_time",
      },
    });
  });

  it("reports render-stream buffering readiness to the experimental timeline", async () => {
    renderHook(() =>
      useMultimodalPlaybackController(CATALOG as any, WORKSPACE as any)
    );

    await waitFor(() => {
      expect(experimentalTimelineOptionsRef.current?.name).toBe(
        "multimodal:scene-1"
      );
    });

    expect(experimentalTimelineOptionsRef.current?.isBufferingCritical).toBe(
      true
    );
    await waitFor(() => {
      expect(
        experimentalTimelineOptionsRef.current?.getBufferReadiness(20)
      ).toBe("ready");
    });

    await experimentalTimelineOptionsRef.current.onPrefetchRange([10, 20]);

    expect(experimentalTimelineOptionsRef.current?.getBufferReadiness(20)).toBe(
      "ready"
    );
  });

  it("prefetches an expanded stream range and warms nearby decodes", async () => {
    renderHook(() =>
      useMultimodalPlaybackController(CATALOG as any, WORKSPACE as any)
    );

    await waitFor(() => {
      expect(experimentalTimelineOptionsRef.current?.name).toBe(
        "multimodal:scene-1"
      );
    });

    await experimentalTimelineOptionsRef.current.onPrefetchRange([10, 20]);

    expect(imageCacheInstance.ensureRange).toHaveBeenCalledWith({
      startNs: 10,
      endNs: 30,
    });
    expect(renderable3dCacheInstance.ensureRange).toHaveBeenCalledWith({
      startNs: 20,
      endNs: 30,
    });
    expect(imageCacheInstance.warmMessagesAroundLogTime).toHaveBeenCalledWith(
      10,
      { aheadCount: 2 }
    );
    expect(
      renderable3dCacheInstance.warmMessagesAroundLogTime
    ).toHaveBeenCalledWith(20, { aheadCount: 1 });
    expect(experimentalTimelineOptionsRef.current?.getBufferedRanges()).toEqual(
      [[0, 30]]
    );
  });

  it("renders image and 3d panels from the shared playback cursor", async () => {
    const { result } = renderHook(() =>
      useMultimodalPlaybackController(CATALOG as any, WORKSPACE as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([10, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.image_panel_1.status).toBe("ready");
      expect(result.current.panelStates.panel_3d_1.status).toBe("ready");
    });

    expect(result.current.panelStates.image_panel_1.imageFrame?.id).toBe(
      "frame-1"
    );
    expect(result.current.panelStates.panel_3d_1.sceneFrame?.pointCount).toBe(
      2
    );
    expect(imageCacheInstance.warmMessagesAroundLogTime).toHaveBeenCalledWith(
      10,
      { aheadCount: 2 }
    );
    expect(
      renderable3dCacheInstance.warmMessagesAroundLogTime
    ).toHaveBeenCalledWith(20, { aheadCount: 1 });
  });

  it("keeps the current panel state when the next playback tick resolves to the same stream frame", async () => {
    const { result } = renderHook(() =>
      useMultimodalPlaybackController(CATALOG as any, WORKSPACE as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([10, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.image_panel_1.status).toBe("ready");
      expect(result.current.panelStates.panel_3d_1.status).toBe("ready");
    });

    const firstPanelStates = result.current.panelStates;
    const firstImagePanelState = result.current.panelStates.image_panel_1;
    const firstPointPanelState = result.current.panelStates.panel_3d_1;
    const decodeCallCount =
      renderable3dCacheInstance.decodeMessage.mock.calls.length;

    const renderPromise =
      experimentalTimelineOptionsRef.current.onRenderTime(20);

    expect(result.current.panelStates.image_panel_1.status).toBe("ready");
    expect(result.current.panelStates.panel_3d_1.status).toBe("ready");

    await renderPromise;

    expect(result.current.panelStates).toBe(firstPanelStates);
    expect(result.current.panelStates.image_panel_1).toBe(firstImagePanelState);
    expect(result.current.panelStates.panel_3d_1).toBe(firstPointPanelState);
    expect(renderable3dCacheInstance.decodeMessage).toHaveBeenCalledTimes(
      decodeCallCount
    );
  });

  it("snaps to the nearest stream frame when the shared timeline starts earlier", async () => {
    useMultimodalTimelineIndexMock.mockReturnValue({
      timeline: {
        sceneId: "scene-1",
        timestampSource: "header.stamp",
        timestampsNs: [0, 10, 20, 30],
        streams: [
          {
            streamId: "/camera/front",
            timestampsNs: [10, 30],
            samples: [
              {
                timestampNs: 10,
                logTimeNs: 10,
                publishTimeNs: 11,
              },
              {
                timestampNs: 30,
                logTimeNs: 30,
                publishTimeNs: 31,
              },
            ],
          },
          {
            streamId: "/lidar/top",
            timestampsNs: [20, 30],
            samples: [
              {
                timestampNs: 20,
                logTimeNs: 20,
                publishTimeNs: 21,
              },
              {
                timestampNs: 30,
                logTimeNs: 30,
                publishTimeNs: 31,
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() =>
      useMultimodalPlaybackController(CATALOG as any, WORKSPACE as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([0, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(0);

    await waitFor(() => {
      expect(result.current.panelStates.image_panel_1.status).toBe("ready");
      expect(result.current.panelStates.panel_3d_1.status).toBe("ready");
    });

    expect(imageCacheInstance.getMessageForLogTime).toHaveBeenCalledWith(10);
    expect(renderable3dCacheInstance.getMessageForLogTime).toHaveBeenCalledWith(
      20
    );
  });
});
