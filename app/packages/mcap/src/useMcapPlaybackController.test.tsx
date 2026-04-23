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
  schemaCodecRegistryMock,
  decodeFoxgloveCameraCalibrationPayloadMock,
  decodeFoxgloveImageAnnotationsPayloadMock,
  bootstrapFetchMock,
  imageBufferedRef,
  projectSceneFrameToImageOverlaysMock,
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
    getSyncTimestamps: vi.fn(() => [10, 30]),
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
    decodeMessageInFrame: vi.fn(async () => ({
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
      warnings: [],
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
    getSyncTimestamps: vi.fn(() => [20, 30]),
    dispose: vi.fn(),
  };
  const rawCacheInstance = {
    ensureRange: vi.fn(async () => {}),
    getMessageForLogTime: vi.fn(() => null),
    getMessages: vi.fn(() => []),
    primeMessages: vi.fn(),
    getSyncSamples: vi.fn(() => []),
    getSyncTimestamps: vi.fn(() => []),
    getVersion: vi.fn(() => 0),
    dispose: vi.fn(),
  };
  const schemaCodecRegistryMock = {
    decodeTransformPayload: vi.fn(() => []),
    decodeLocationPayload: vi.fn(() => null),
  };
  const decodeFoxgloveCameraCalibrationPayloadMock = vi.fn(() => ({
    timestampNs: 20,
    frameId: "camera",
    width: 1920,
    height: 1080,
    distortionModel: "",
    d: [],
    k: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    r: [],
    p: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  }));
  const decodeFoxgloveImageAnnotationsPayloadMock = vi.fn(() => ({
    timestampNs: 20,
    overlays: [],
  }));
  const projectSceneFrameToImageOverlaysMock = vi.fn(() => []);
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
    schemaCodecRegistryMock,
    decodeFoxgloveCameraCalibrationPayloadMock,
    decodeFoxgloveImageAnnotationsPayloadMock,
    bootstrapFetchMock,
    imageCacheInstance,
    projectSceneFrameToImageOverlaysMock,
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

vi.mock("./schema-codec-registry", () => ({
  BUILTIN_SCHEMA_CODEC_REGISTRY: schemaCodecRegistryMock,
}));

vi.mock("./foxglove-camera-calibration-decoder", () => ({
  decodeFoxgloveCameraCalibrationPayload:
    decodeFoxgloveCameraCalibrationPayloadMock,
}));

vi.mock("./foxglove-image-annotations-decoder", () => ({
  decodeFoxgloveImageAnnotationsPayload:
    decodeFoxgloveImageAnnotationsPayloadMock,
}));

vi.mock("./image-projection", () => ({
  projectSceneFrameToImageOverlays: projectSceneFrameToImageOverlaysMock,
}));

const CATALOG = {
  sceneId: "scene-1",
  datasetId: "dataset-1",
  sampleId: "sample-1",
  mediaField: "filepath",
  mediaPath: "/tmp/run.mcap",
  sourceKind: "mcap",
  catalogVersion: "multimodal-workspace-v4",
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
  mediaField: "filepath",
  sourceKind: "mcap",
  sync: {
    timestampSource: "header.stamp",
    fallback: "log_time",
    mode: "nearest",
  },
  activePanelId: "image_panel_1",
  maximizedPanelId: null,
  sidebarCollapsed: false,
  sidebarWidth: 208,
  layoutTree: {
    type: "split",
    direction: "row",
    splitPercentage: 50,
    first: {
      type: "leaf",
      panelId: "image_panel_1",
    },
    second: {
      type: "leaf",
      panelId: "panel_3d_1",
    },
  },
  panels: [
    {
      panelId: "image_panel_1",
      archetype: "image",
      title: "Image panel",
      renderStreamId: "/camera/front",
      visibleStreamIds: [],
      imageConfig: {
        project3dOverlays: false,
      },
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
  panelsById: {
    image_panel_1: {
      panelId: "image_panel_1",
      archetype: "image",
      title: "Image panel",
      renderStreamId: "/camera/front",
      visibleStreamIds: [],
      imageConfig: {
        project3dOverlays: false,
      },
      frameConfig: {
        fixedFrameId: null,
        displayFrameId: null,
        followMode: "off",
        locationStreamId: null,
        enuFrameId: null,
      },
      sceneConfig: { upAxis: "z", backgroundColor: "#10151d" },
    },
    panel_3d_1: {
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
  },
} as const;

describe("useMultimodalPlaybackController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    experimentalTimelineOptionsRef.current = null;
    imageBufferedRef.current = false;
    renderable3dBufferedRef.current = false;
    bootstrapFetchMock.mockClear();
    schemaCodecRegistryMock.decodeTransformPayload.mockClear();
    schemaCodecRegistryMock.decodeTransformPayload.mockReturnValue([]);
    schemaCodecRegistryMock.decodeLocationPayload.mockClear();
    schemaCodecRegistryMock.decodeLocationPayload.mockReturnValue(null);
    decodeFoxgloveCameraCalibrationPayloadMock.mockClear();
    decodeFoxgloveImageAnnotationsPayloadMock.mockClear();
    projectSceneFrameToImageOverlaysMock.mockClear();
    decodeFoxgloveCameraCalibrationPayloadMock.mockReturnValue({
      timestampNs: 20,
      frameId: "camera",
      width: 1920,
      height: 1080,
      distortionModel: "",
      d: [],
      k: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      r: [],
      p: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    });
    decodeFoxgloveImageAnnotationsPayloadMock.mockReturnValue({
      timestampNs: 20,
      overlays: [],
    });
    projectSceneFrameToImageOverlaysMock.mockReturnValue([]);
    rawCacheInstance.getMessages.mockReturnValue([]);
    rawCacheInstance.getMessageForLogTime.mockReturnValue(null);
    rawCacheInstance.getSyncSamples.mockReturnValue([]);
    rawCacheInstance.getSyncTimestamps.mockReturnValue([]);
    rawCacheInstance.getVersion.mockImplementation(
      () => rawCacheInstance.getMessages().length
    );
    renderable3dCacheInstance.decodeMessage.mockImplementation(async () => ({
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
      warnings: [],
    }));
    renderable3dCacheInstance.decodeMessageInFrame.mockImplementation(
      async (message: any) => renderable3dCacheInstance.decodeMessage(message)
    );
    renderable3dCacheInstance.getMessageForLogTime.mockImplementation(
      (timestampNs: number) => {
        if (timestampNs === 20) {
          return {
            messageId: "cloud-1",
            logTimeNs: 20,
            publishTimeNs: 21,
            payload: new Uint8Array([2]),
          };
        }

        return null;
      }
    );
    renderable3dCacheInstance.getSyncSamples.mockReturnValue([
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
    ]);
    renderable3dCacheInstance.getSyncTimestamps.mockReturnValue([20, 30]);
    imageCacheInstance.getMessageForLogTime.mockImplementation(
      (timestampNs: number) => {
        if (timestampNs === 10) {
          return {
            messageId: "frame-1",
            logTimeNs: 10,
            publishTimeNs: 11,
            payload: new Uint8Array([1]),
          };
        }

        return null;
      }
    );
    imageCacheInstance.getSyncSamples.mockReturnValue([
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
    ]);
    imageCacheInstance.getSyncTimestamps.mockReturnValue([10, 30]);
    imageCacheInstance.decodeMessage.mockImplementation(async () => ({
      id: "frame-1",
      messageId: "frame-1",
      src: "blob:frame-1",
      timestampNs: 10,
      format: "jpeg",
      frameId: "camera",
      logTimeNs: 10,
      publishTimeNs: 11,
      objectUrl: "blob:frame-1",
    }));
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

  it("requests the shared timeline only for the active playback stream", async () => {
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
        streamIds: ["/camera/front"],
        timestampSource: "header.stamp",
        fallback: "log_time",
      },
    });
  });

  it("does not wait for background render streams before resolving playback prefetch", async () => {
    let resolveBackgroundFetch: (() => void) | null = null;
    const backgroundFetchPromise = new Promise<void>((resolve) => {
      resolveBackgroundFetch = resolve;
    });

    renderable3dCacheInstance.ensureRange.mockImplementation(
      async () => backgroundFetchPromise
    );

    renderHook(() =>
      useMultimodalPlaybackController(CATALOG as any, WORKSPACE as any)
    );

    await waitFor(() => {
      expect(
        experimentalTimelineOptionsRef.current?.onPrefetchRange
      ).toBeTypeOf("function");
    });

    let didResolvePrefetch = false;
    const prefetchPromise =
      experimentalTimelineOptionsRef.current.onPrefetchRange([10, 10]);
    void prefetchPromise.then(() => {
      didResolvePrefetch = true;
    });

    await waitFor(() => {
      expect(imageCacheInstance.ensureRange).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(renderable3dCacheInstance.ensureRange).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(didResolvePrefetch).toBe(true);
    });

    resolveBackgroundFetch?.();
    await backgroundFetchPromise;
  });

  it("projects SceneUpdate overlays into image panels without adding support streams to the timeline", async () => {
    const catalog = {
      ...CATALOG,
      streams: [
        {
          streamId: "/camera/front",
          topic: "/camera/front",
          schemaName: "foxglove.CompressedImage",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "image",
          frameId: "camera",
          affordances: ["image"],
          compatiblePanels: ["image"],
          channelId: 1,
          schemaId: 1,
          timeRange: { startNs: 20, endNs: 20 },
          messageCount: 1,
        },
        {
          streamId: "/camera/camera_info",
          topic: "/camera/camera_info",
          schemaName: "foxglove.CameraCalibration",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "other",
          frameId: "camera",
          affordances: ["camera", "calibration"],
          compatiblePanels: ["image"],
          channelId: 2,
          schemaId: 2,
          timeRange: { startNs: 20, endNs: 20 },
          messageCount: 1,
        },
        {
          streamId: "/semantic_map",
          topic: "/semantic_map",
          schemaName: "foxglove.SceneUpdate",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "3d",
          frameId: "camera",
          affordances: ["sceneupdate", "overlay", "3d"],
          compatiblePanels: ["3d", "image"],
          channelId: 3,
          schemaId: 3,
          timeRange: { startNs: 20, endNs: 20 },
          messageCount: 1,
        },
      ],
      frames: [{ frameId: "camera" }],
      transforms: [],
      locationTopics: [],
    };
    const workspace = {
      ...WORKSPACE,
      activePanelId: "image_panel_1",
      layoutTree: {
        type: "leaf",
        panelId: "image_panel_1",
      },
      panels: [
        {
          ...WORKSPACE.panels[0],
          renderStreamId: "/camera/front",
          visibleStreamIds: ["/camera/camera_info", "/semantic_map"],
          imageConfig: {
            project3dOverlays: true,
          },
        },
      ],
      panelsById: {
        image_panel_1: {
          ...WORKSPACE.panelsById.image_panel_1,
          renderStreamId: "/camera/front",
          visibleStreamIds: ["/camera/camera_info", "/semantic_map"],
          imageConfig: {
            project3dOverlays: true,
          },
        },
      },
    };

    useMultimodalTimelineIndexMock.mockReturnValue({
      timeline: {
        sceneId: "scene-1",
        timestampSource: "header.stamp",
        timestampsNs: [20],
        streams: [
          {
            streamId: "/camera/front",
            samples: [
              {
                timestampNs: 20,
                logTimeNs: 20,
                publishTimeNs: 21,
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    imageCacheInstance.getMessageForLogTime.mockImplementation(
      (timestampNs: number) => {
        if (timestampNs === 20) {
          return {
            messageId: "frame-2",
            logTimeNs: 20,
            publishTimeNs: 21,
            payload: new Uint8Array([1]),
          };
        }

        return null;
      }
    );
    imageCacheInstance.getSyncSamples.mockReturnValue([
      {
        timestampNs: 20,
        logTimeNs: 20,
        publishTimeNs: 21,
      },
    ]);
    imageCacheInstance.decodeMessage.mockResolvedValue({
      id: "frame-2",
      messageId: "frame-2",
      src: "blob:frame-2",
      timestampNs: 20,
      format: "jpeg",
      frameId: "camera",
      logTimeNs: 20,
      publishTimeNs: 21,
      objectUrl: "blob:frame-2",
    });
    rawCacheInstance.getMessageForLogTime.mockImplementation(
      (timestampNs: number) => {
        if (timestampNs === 20) {
          return {
            messageId: "calibration-1",
            logTimeNs: 20,
            publishTimeNs: 20,
            syncTimestampNs: 20,
            payload: new Uint8Array([3]),
          };
        }

        return null;
      }
    );
    rawCacheInstance.getSyncSamples.mockReturnValue([
      {
        timestampNs: 20,
        logTimeNs: 20,
        publishTimeNs: 20,
      },
    ]);
    renderable3dCacheInstance.getMessageForLogTime.mockImplementation(
      (timestampNs: number) => {
        if (timestampNs === 20) {
          return {
            messageId: "sceneupdate-1",
            logTimeNs: 20,
            publishTimeNs: 20,
            payload: new Uint8Array([2]),
          };
        }

        return null;
      }
    );
    renderable3dCacheInstance.getSyncSamples.mockReturnValue([
      {
        timestampNs: 20,
        logTimeNs: 20,
        publishTimeNs: 20,
      },
    ]);
    renderable3dCacheInstance.decodeMessage.mockResolvedValue({
      id: "sceneupdate-1",
      messageId: "sceneupdate-1",
      pointCount: 2,
      bounds: {
        min: [0, 0, 0] as [number, number, number],
        max: [1, 1, 0] as [number, number, number],
      },
      frameId: "camera",
      primitives: [
        {
          kind: "line-strip",
          id: "lane-center",
          frameId: "camera",
          positions: new Float32Array([0, 0, 1, 1, 1, 1]),
          colors: null,
          solidColor: "#fff",
        },
      ],
      logTimeNs: 20,
      publishTimeNs: 20,
      warnings: ["Skipped unsupported SceneUpdate primitives: texts"],
    });
    projectSceneFrameToImageOverlaysMock.mockReturnValue([
      {
        kind: "polyline",
        id: "projected-lane",
        points: [
          { x: 20, y: 30 },
          { x: 80, y: 90 },
        ],
        mode: "line-strip",
        strokeColor: "#fff",
        strokeWidth: 2,
      },
    ]);

    const { result } = renderHook(() =>
      useMultimodalPlaybackController(catalog as any, workspace as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([20, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.image_panel_1.status).toBe("ready");
    });

    expect(useMultimodalTimelineIndexMock).toHaveBeenLastCalledWith({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      request: {
        mediaField: "filepath",
        streamIds: ["/camera/front"],
        timestampSource: "header.stamp",
        fallback: "log_time",
      },
    });
    expect(
      result.current.panelStates.image_panel_1.imageFrame?.overlays
    ).toHaveLength(1);
    expect(result.current.panelStates.image_panel_1.warnings).toContain(
      "Skipped unsupported SceneUpdate primitives: texts"
    );
    expect(result.current.panelStates.image_panel_1.messageIds).toEqual([
      "frame-2",
      "calibration-1",
      "sceneupdate-1",
    ]);
  });

  it("does not project SceneUpdate image overlays while the image toggle is disabled", async () => {
    const catalog = {
      ...CATALOG,
      streams: [
        {
          streamId: "/camera/front",
          topic: "/camera/front",
          schemaName: "foxglove.CompressedImage",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "image",
          frameId: "camera",
          affordances: ["image"],
          compatiblePanels: ["image"],
          channelId: 1,
          schemaId: 1,
          timeRange: { startNs: 20, endNs: 20 },
          messageCount: 1,
        },
        {
          streamId: "/semantic_map",
          topic: "/semantic_map",
          schemaName: "foxglove.SceneUpdate",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "3d",
          frameId: "camera",
          affordances: ["sceneupdate", "overlay", "3d"],
          compatiblePanels: ["3d", "image"],
          channelId: 2,
          schemaId: 2,
          timeRange: { startNs: 20, endNs: 20 },
          messageCount: 1,
        },
      ],
      frames: [{ frameId: "camera" }],
      transforms: [],
      locationTopics: [],
    };
    const workspace = {
      ...WORKSPACE,
      activePanelId: "image_panel_1",
      layoutTree: {
        type: "leaf",
        panelId: "image_panel_1",
      },
      panels: [
        {
          ...WORKSPACE.panels[0],
          renderStreamId: "/camera/front",
          visibleStreamIds: ["/semantic_map"],
        },
      ],
      panelsById: {
        image_panel_1: {
          ...WORKSPACE.panelsById.image_panel_1,
          renderStreamId: "/camera/front",
          visibleStreamIds: ["/semantic_map"],
        },
      },
    };

    useMultimodalTimelineIndexMock.mockReturnValue({
      timeline: {
        sceneId: "scene-1",
        timestampSource: "header.stamp",
        timestampsNs: [20],
        streams: [
          {
            streamId: "/camera/front",
            samples: [
              {
                timestampNs: 20,
                logTimeNs: 20,
                publishTimeNs: 21,
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    imageCacheInstance.getMessageForLogTime.mockImplementation(
      (timestampNs: number) => {
        if (timestampNs === 20) {
          return {
            messageId: "frame-2",
            logTimeNs: 20,
            publishTimeNs: 21,
            payload: new Uint8Array([1]),
          };
        }

        return null;
      }
    );
    imageCacheInstance.getSyncSamples.mockReturnValue([
      {
        timestampNs: 20,
        logTimeNs: 20,
        publishTimeNs: 21,
      },
    ]);
    imageCacheInstance.decodeMessage.mockResolvedValue({
      id: "frame-2",
      messageId: "frame-2",
      src: "blob:frame-2",
      timestampNs: 20,
      format: "jpeg",
      frameId: "camera",
      logTimeNs: 20,
      publishTimeNs: 21,
      objectUrl: "blob:frame-2",
    });
    renderable3dCacheInstance.getMessageForLogTime.mockImplementation(
      (timestampNs: number) => {
        if (timestampNs === 20) {
          return {
            messageId: "sceneupdate-1",
            logTimeNs: 20,
            publishTimeNs: 20,
            payload: new Uint8Array([2]),
          };
        }

        return null;
      }
    );
    renderable3dCacheInstance.getSyncSamples.mockReturnValue([
      {
        timestampNs: 20,
        logTimeNs: 20,
        publishTimeNs: 20,
      },
    ]);
    renderable3dCacheInstance.decodeMessage.mockResolvedValue({
      id: "sceneupdate-1",
      messageId: "sceneupdate-1",
      pointCount: 2,
      bounds: {
        min: [0, 0, 0] as [number, number, number],
        max: [1, 1, 0] as [number, number, number],
      },
      frameId: "camera",
      primitives: [
        {
          kind: "line-strip",
          id: "lane-center",
          frameId: "camera",
          positions: new Float32Array([0, 0, 1, 1, 1, 1]),
          colors: null,
          solidColor: "#fff",
        },
      ],
      logTimeNs: 20,
      publishTimeNs: 20,
      warnings: [],
    });

    const { result } = renderHook(() =>
      useMultimodalPlaybackController(catalog as any, workspace as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([20, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.image_panel_1.status).toBe("ready");
    });

    expect(result.current.panelStates.image_panel_1.warnings).toEqual([]);
    expect(
      result.current.panelStates.image_panel_1.imageFrame?.overlays ?? []
    ).toHaveLength(0);
    expect(result.current.panelStates.image_panel_1.messageIds).toEqual([
      "frame-2",
    ]);
    expect(projectSceneFrameToImageOverlaysMock).not.toHaveBeenCalled();
    expect(renderable3dCacheInstance.decodeMessage).not.toHaveBeenCalled();
  });

  it("warns when SceneUpdate image overlays are selected without calibration and projection is enabled", async () => {
    const catalog = {
      ...CATALOG,
      streams: [
        {
          streamId: "/camera/front",
          topic: "/camera/front",
          schemaName: "foxglove.CompressedImage",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "image",
          frameId: "camera",
          affordances: ["image"],
          compatiblePanels: ["image"],
          channelId: 1,
          schemaId: 1,
          timeRange: { startNs: 20, endNs: 20 },
          messageCount: 1,
        },
        {
          streamId: "/semantic_map",
          topic: "/semantic_map",
          schemaName: "foxglove.SceneUpdate",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "3d",
          frameId: "camera",
          affordances: ["sceneupdate", "overlay", "3d"],
          compatiblePanels: ["3d", "image"],
          channelId: 2,
          schemaId: 2,
          timeRange: { startNs: 20, endNs: 20 },
          messageCount: 1,
        },
      ],
      frames: [{ frameId: "camera" }],
      transforms: [],
      locationTopics: [],
    };
    const workspace = {
      ...WORKSPACE,
      activePanelId: "image_panel_1",
      layoutTree: {
        type: "leaf",
        panelId: "image_panel_1",
      },
      panels: [
        {
          ...WORKSPACE.panels[0],
          renderStreamId: "/camera/front",
          visibleStreamIds: ["/semantic_map"],
          imageConfig: {
            project3dOverlays: true,
          },
        },
      ],
      panelsById: {
        image_panel_1: {
          ...WORKSPACE.panelsById.image_panel_1,
          renderStreamId: "/camera/front",
          visibleStreamIds: ["/semantic_map"],
          imageConfig: {
            project3dOverlays: true,
          },
        },
      },
    };

    useMultimodalTimelineIndexMock.mockReturnValue({
      timeline: {
        sceneId: "scene-1",
        timestampSource: "header.stamp",
        timestampsNs: [20],
        streams: [
          {
            streamId: "/camera/front",
            samples: [
              {
                timestampNs: 20,
                logTimeNs: 20,
                publishTimeNs: 21,
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    imageCacheInstance.getMessageForLogTime.mockImplementation(
      (timestampNs: number) => {
        if (timestampNs === 20) {
          return {
            messageId: "frame-2",
            logTimeNs: 20,
            publishTimeNs: 21,
            payload: new Uint8Array([1]),
          };
        }

        return null;
      }
    );
    imageCacheInstance.getSyncSamples.mockReturnValue([
      {
        timestampNs: 20,
        logTimeNs: 20,
        publishTimeNs: 21,
      },
    ]);
    imageCacheInstance.decodeMessage.mockResolvedValue({
      id: "frame-2",
      messageId: "frame-2",
      src: "blob:frame-2",
      timestampNs: 20,
      format: "jpeg",
      frameId: "camera",
      logTimeNs: 20,
      publishTimeNs: 21,
      objectUrl: "blob:frame-2",
    });
    renderable3dCacheInstance.getMessageForLogTime.mockImplementation(
      (timestampNs: number) => {
        if (timestampNs === 20) {
          return {
            messageId: "sceneupdate-1",
            logTimeNs: 20,
            publishTimeNs: 20,
            payload: new Uint8Array([2]),
          };
        }

        return null;
      }
    );
    renderable3dCacheInstance.getSyncSamples.mockReturnValue([
      {
        timestampNs: 20,
        logTimeNs: 20,
        publishTimeNs: 20,
      },
    ]);
    renderable3dCacheInstance.decodeMessage.mockResolvedValue({
      id: "sceneupdate-1",
      messageId: "sceneupdate-1",
      pointCount: 2,
      bounds: {
        min: [0, 0, 0] as [number, number, number],
        max: [1, 1, 0] as [number, number, number],
      },
      frameId: "camera",
      primitives: [
        {
          kind: "line-strip",
          id: "lane-center",
          frameId: "camera",
          positions: new Float32Array([0, 0, 1, 1, 1, 1]),
          colors: null,
          solidColor: "#fff",
        },
      ],
      logTimeNs: 20,
      publishTimeNs: 20,
      warnings: [],
    });

    const { result } = renderHook(() =>
      useMultimodalPlaybackController(catalog as any, workspace as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([20, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.image_panel_1.status).toBe("ready");
    });

    expect(result.current.panelStates.image_panel_1.warnings).toContain(
      "SceneUpdate overlays require a camera calibration support stream"
    );
    expect(
      result.current.panelStates.image_panel_1.imageFrame?.overlays ?? []
    ).toHaveLength(0);
    expect(projectSceneFrameToImageOverlaysMock).not.toHaveBeenCalled();
  });

  it("decodes Foxglove transform streams with their registered schema", async () => {
    const catalog = {
      ...CATALOG,
      streams: [
        ...CATALOG.streams,
        {
          streamId: "/tf",
          topic: "/tf",
          schemaName: "foxglove.FrameTransform",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "transform",
          frameId: null,
          affordances: ["transforms"],
          compatiblePanels: [],
          channelId: 3,
          schemaId: 3,
          timeRange: { startNs: 10, endNs: 30 },
          messageCount: 1,
        },
      ],
    };

    rawCacheInstance.getMessages.mockReturnValue([
      {
        messageId: "tf-1",
        logTimeNs: 10,
        publishTimeNs: 10,
        syncTimestampNs: 10,
        payload: new Uint8Array([1, 2, 3]),
      },
    ]);
    schemaCodecRegistryMock.decodeTransformPayload.mockReturnValue([
      {
        parentFrameId: "base_link",
        childFrameId: "map",
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
    ]);

    renderHook(() =>
      useMultimodalPlaybackController(catalog as any, WORKSPACE as any)
    );

    await waitFor(() => {
      expect(schemaCodecRegistryMock.decodeTransformPayload).toHaveBeenCalled();
    });

    expect(schemaCodecRegistryMock.decodeTransformPayload).toHaveBeenCalledWith(
      "foxglove.FrameTransform",
      expect.any(Uint8Array)
    );
  });

  it("sorts transform samples by sync time before resolving 3d transforms", async () => {
    const catalog = {
      ...CATALOG,
      streams: [
        {
          ...CATALOG.streams[0],
        },
        {
          ...CATALOG.streams[1],
          frameId: "LIDAR_TOP",
        },
        {
          streamId: "/tf",
          topic: "/tf",
          schemaName: "foxglove.FrameTransform",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "transform",
          frameId: null,
          affordances: ["transforms"],
          compatiblePanels: [],
          channelId: 3,
          schemaId: 3,
          timeRange: { startNs: 10, endNs: 30 },
          messageCount: 3,
        },
      ],
      frames: [
        { frameId: "camera" },
        { frameId: "map" },
        { frameId: "base_link" },
        { frameId: "LIDAR_TOP" },
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
                fixedFrameId: "base_link",
                displayFrameId: "base_link",
              },
            }
          : panel
      ),
    };

    renderable3dCacheInstance.decodeMessage.mockResolvedValue({
      id: "cloud-1",
      messageId: "cloud-1",
      pointCount: 1,
      bounds: {
        min: [1, 0, 0] as [number, number, number],
        max: [1, 0, 0] as [number, number, number],
      },
      frameId: "LIDAR_TOP",
      primitives: [
        {
          kind: "points",
          id: "points",
          frameId: "LIDAR_TOP",
          pointCount: 1,
          positions: new Float32Array([1, 0, 0]),
          intensity: null,
          colors: null,
          solidColor: null,
          pointSize: null,
        },
      ],
      logTimeNs: 20,
      publishTimeNs: 21,
    });
    rawCacheInstance.getMessages.mockReturnValue([
      {
        messageId: "tf-map",
        logTimeNs: 20,
        publishTimeNs: 20,
        syncTimestampNs: 20,
        payload: Uint8Array.of(1),
      },
      {
        messageId: "tf-future",
        logTimeNs: 20,
        publishTimeNs: 20,
        syncTimestampNs: 30,
        payload: Uint8Array.of(2),
      },
      {
        messageId: "tf-lidar",
        logTimeNs: 20,
        publishTimeNs: 20,
        syncTimestampNs: 20,
        payload: Uint8Array.of(3),
      },
    ]);
    schemaCodecRegistryMock.decodeTransformPayload.mockImplementation(
      (_schemaName: string, payload: Uint8Array) => {
        switch (payload[0]) {
          case 1:
            return [
              {
                parentFrameId: "map",
                childFrameId: "base_link",
                translation: [0, 0, 0],
                rotation: [0, 0, 0, 1],
              },
            ];
          case 2:
            return [
              {
                parentFrameId: "base_link",
                childFrameId: "unused_sensor",
                translation: [0, 0, 0],
                rotation: [0, 0, 0, 1],
              },
            ];
          case 3:
            return [
              {
                parentFrameId: "base_link",
                childFrameId: "LIDAR_TOP",
                translation: [0, 0, 0],
                rotation: [0, 0, 0, 1],
              },
            ];
          default:
            return [];
        }
      }
    );

    const { result } = renderHook(() =>
      useMultimodalPlaybackController(catalog as any, workspace as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([10, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.panel_3d_1.status).toBe("ready");
    });
    expect(result.current.panelStates.panel_3d_1.warnings).toEqual([]);
    expect(result.current.panelStates.panel_3d_1.sceneFrame?.frameId).toBe(
      "base_link"
    );
  });

  it("refreshes tf transforms when new raw windows are buffered", async () => {
    const catalog = {
      ...CATALOG,
      streams: [
        {
          ...CATALOG.streams[0],
        },
        {
          ...CATALOG.streams[1],
          frameId: "LIDAR_TOP",
        },
        {
          streamId: "/tf",
          topic: "/tf",
          schemaName: "foxglove.FrameTransform",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "transform",
          frameId: null,
          affordances: ["transforms"],
          compatiblePanels: [],
          channelId: 3,
          schemaId: 3,
          timeRange: { startNs: 10, endNs: 30 },
          messageCount: 2,
        },
      ],
      frames: [
        { frameId: "camera" },
        { frameId: "map" },
        { frameId: "base_link" },
        { frameId: "LIDAR_TOP" },
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
                fixedFrameId: "base_link",
                displayFrameId: "base_link",
              },
            }
          : panel
      ),
    };
    let transformMessages = [
      {
        messageId: "tf-map",
        logTimeNs: 20,
        publishTimeNs: 20,
        syncTimestampNs: 20,
        payload: Uint8Array.of(1),
      },
    ];

    renderable3dCacheInstance.decodeMessage.mockResolvedValue({
      id: "cloud-1",
      messageId: "cloud-1",
      pointCount: 1,
      bounds: {
        min: [1, 0, 0] as [number, number, number],
        max: [1, 0, 0] as [number, number, number],
      },
      frameId: "LIDAR_TOP",
      primitives: [
        {
          kind: "points",
          id: "points",
          frameId: "LIDAR_TOP",
          pointCount: 1,
          positions: new Float32Array([1, 0, 0]),
          intensity: null,
          colors: null,
          solidColor: null,
          pointSize: null,
        },
      ],
      logTimeNs: 20,
      publishTimeNs: 21,
    });
    renderable3dCacheInstance.decodeMessageInFrame.mockImplementation(
      async (_message: any, options: any) => {
        const decoded = await renderable3dCacheInstance.decodeMessage(_message);
        const matrix = options.resolveTransformMatrix(
          "LIDAR_TOP",
          options.targetFrameId
        );

        if (!matrix) {
          return {
            ...decoded,
            frameId: options.targetFrameId,
            pointCount: 0,
            primitives: [],
            warnings: [
              `No transform from LIDAR_TOP to ${options.targetFrameId} for ${options.warningContext}`,
            ],
          };
        }

        return {
          ...decoded,
          frameId: options.targetFrameId,
          warnings: [],
        };
      }
    );
    rawCacheInstance.getMessages.mockImplementation(() => transformMessages);
    schemaCodecRegistryMock.decodeTransformPayload.mockImplementation(
      (_schemaName: string, payload: Uint8Array) => {
        switch (payload[0]) {
          case 1:
            return [
              {
                parentFrameId: "map",
                childFrameId: "base_link",
                translation: [0, 0, 0],
                rotation: [0, 0, 0, 1],
              },
            ];
          case 2:
            return [
              {
                parentFrameId: "base_link",
                childFrameId: "LIDAR_TOP",
                translation: [0, 0, 0],
                rotation: [0, 0, 0, 1],
              },
            ];
          default:
            return [];
        }
      }
    );

    const { result } = renderHook(() =>
      useMultimodalPlaybackController(catalog as any, workspace as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([10, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.panel_3d_1.warnings).toContain(
        "No transform from LIDAR_TOP to base_link for /lidar/top"
      );
    });

    transformMessages = [
      ...transformMessages,
      {
        messageId: "tf-lidar",
        logTimeNs: 20,
        publishTimeNs: 20,
        syncTimestampNs: 20,
        payload: Uint8Array.of(2),
      },
    ];

    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.panel_3d_1.status).toBe("ready");
    });
    expect(result.current.panelStates.panel_3d_1.warnings).toEqual([]);
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

  it("passes Foxglove schema names through the playback caches", async () => {
    const foxgloveCatalog = {
      ...CATALOG,
      streams: CATALOG.streams.map((stream) =>
        stream.streamId === "/camera/front"
          ? {
              ...stream,
              messageEncoding: "protobuf",
              schemaEncoding: "protobuf",
              schemaName: "foxglove.CompressedImage",
            }
          : {
              ...stream,
              messageEncoding: "protobuf",
              schemaEncoding: "protobuf",
              schemaName: "foxglove.PointCloud",
            }
      ),
    };
    const { result } = renderHook(() =>
      useMultimodalPlaybackController(foxgloveCatalog as any, WORKSPACE as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([10, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.image_panel_1.status).toBe("ready");
      expect(result.current.panelStates.panel_3d_1.status).toBe("ready");
    });

    expect(imageCacheConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: "foxglove.CompressedImage",
      })
    );
    expect(renderable3dCacheConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: "foxglove.PointCloud",
      })
    );
  });

  it("re-renders 3d scenes when the display frame changes", async () => {
    const catalog = {
      ...CATALOG,
      streams: [
        ...CATALOG.streams,
        {
          streamId: "/tf",
          topic: "/tf",
          schemaName: "foxglove.FrameTransform",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "transform",
          frameId: null,
          affordances: ["transforms"],
          compatiblePanels: [],
          channelId: 3,
          schemaId: 3,
          timeRange: { startNs: 10, endNs: 30 },
          messageCount: 1,
        },
      ],
      frames: [...CATALOG.frames, { frameId: "base_link" }],
    };
    const initialWorkspace = {
      ...WORKSPACE,
      panels: WORKSPACE.panels.map((panel) =>
        panel.panelId === "panel_3d_1"
          ? {
              ...panel,
              frameConfig: {
                ...panel.frameConfig,
                fixedFrameId: "base_link",
                displayFrameId: "base_link",
              },
            }
          : panel
      ),
    };
    const updatedWorkspace = {
      ...initialWorkspace,
      panels: initialWorkspace.panels.map((panel) =>
        panel.panelId === "panel_3d_1"
          ? {
              ...panel,
              frameConfig: {
                ...panel.frameConfig,
                displayFrameId: "map",
              },
            }
          : panel
      ),
    };

    renderable3dCacheInstance.decodeMessage.mockResolvedValue({
      id: "cloud-1",
      messageId: "cloud-1",
      pointCount: 1,
      bounds: {
        min: [1, 0, 0] as [number, number, number],
        max: [1, 0, 0] as [number, number, number],
      },
      frameId: "base_link",
      primitives: [
        {
          kind: "points",
          id: "points",
          frameId: "base_link",
          pointCount: 1,
          positions: new Float32Array([1, 0, 0]),
          intensity: null,
          colors: null,
          solidColor: null,
          pointSize: null,
        },
      ],
      logTimeNs: 20,
      publishTimeNs: 21,
    });
    rawCacheInstance.getMessages.mockReturnValue([
      {
        messageId: "tf-1",
        logTimeNs: 20,
        publishTimeNs: 20,
        syncTimestampNs: 20,
        payload: new Uint8Array([3]),
      },
    ]);
    schemaCodecRegistryMock.decodeTransformPayload.mockReturnValue([
      {
        parentFrameId: "map",
        childFrameId: "base_link",
        translation: [10, 0, 0],
        rotation: [0, 0, 0, 1],
      },
    ]);

    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useMultimodalPlaybackController(catalog as any, workspace as any),
      {
        initialProps: { workspace: initialWorkspace },
      }
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([10, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.panel_3d_1.sceneFrame?.frameId).toBe(
        "base_link"
      );
    });
    expect(
      Array.from(
        result.current.panelStates.panel_3d_1.sceneFrame?.primitives[0]
          .positions ?? []
      )
    ).toEqual([1, 0, 0]);

    rerender({ workspace: updatedWorkspace });
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.panel_3d_1.sceneFrame?.frameId).toBe(
        "map"
      );
    });
    expect(
      Array.from(
        result.current.panelStates.panel_3d_1.sceneFrame?.primitives[0]
          .positions ?? []
      )
    ).toEqual([11, 0, 0]);
  });

  it("derives ego follow poses from tf when no location topic is selected", async () => {
    const catalog = {
      ...CATALOG,
      streams: [
        ...CATALOG.streams,
        {
          streamId: "/tf",
          topic: "/tf",
          schemaName: "foxglove.FrameTransform",
          schemaEncoding: "protobuf",
          messageEncoding: "protobuf",
          kind: "transform",
          frameId: null,
          affordances: ["transforms"],
          compatiblePanels: [],
          channelId: 3,
          schemaId: 3,
          timeRange: { startNs: 10, endNs: 30 },
          messageCount: 1,
        },
      ],
      frames: [...CATALOG.frames, { frameId: "base_link" }],
    };
    const workspace = {
      ...WORKSPACE,
      panels: WORKSPACE.panels.map((panel) =>
        panel.panelId === "panel_3d_1"
          ? {
              ...panel,
              frameConfig: {
                ...panel.frameConfig,
                fixedFrameId: "map",
                displayFrameId: "map",
                followMode: "pose",
                locationStreamId: null,
              },
            }
          : panel
      ),
    };

    rawCacheInstance.getMessages.mockReturnValue([
      {
        messageId: "tf-1",
        logTimeNs: 20,
        publishTimeNs: 20,
        syncTimestampNs: 20,
        payload: new Uint8Array([3]),
      },
    ]);
    schemaCodecRegistryMock.decodeTransformPayload.mockReturnValue([
      {
        parentFrameId: "map",
        childFrameId: "base_link",
        translation: [10, 1, 0],
        rotation: [0, 0, 0.7071068, 0.7071068],
      },
    ]);

    const { result } = renderHook(() =>
      useMultimodalPlaybackController(catalog as any, workspace as any)
    );

    await experimentalTimelineOptionsRef.current.onPrefetchRange([10, 20]);
    await experimentalTimelineOptionsRef.current.onRenderTime(20);

    await waitFor(() => {
      expect(result.current.panelStates.panel_3d_1.followPose).not.toBeNull();
    });
    expect(result.current.panelStates.panel_3d_1.followPose?.position).toEqual([
      10, 1, 0,
    ]);
    expect(
      result.current.panelStates.panel_3d_1.followPose?.orientation?.[0]
    ).toBeCloseTo(0);
    expect(
      result.current.panelStates.panel_3d_1.followPose?.orientation?.[1]
    ).toBeCloseTo(0);
    expect(
      result.current.panelStates.panel_3d_1.followPose?.orientation?.[2]
    ).toBeCloseTo(0.7071068);
    expect(
      result.current.panelStates.panel_3d_1.followPose?.orientation?.[3]
    ).toBeCloseTo(0.7071068);
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
