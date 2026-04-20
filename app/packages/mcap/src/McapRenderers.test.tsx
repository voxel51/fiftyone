/**
 * @vitest-environment jsdom
 */
import {
  createSampleRendererRenderContext,
  type SampleRendererRenderContext,
} from "@fiftyone/plugins";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultimodalGridRenderer } from "./MultimodalGridRenderer";
import { MultimodalModalRenderer } from "./MultimodalModalRenderer";

const { useMultimodalWorkspaceMock } = vi.hoisted(() => ({
  useMultimodalWorkspaceMock: vi.fn(),
}));
const { useMultimodalPlaybackControllerMock } = vi.hoisted(() => ({
  useMultimodalPlaybackControllerMock: vi.fn(),
}));
const { useKeyBindingsMock } = vi.hoisted(() => ({
  useKeyBindingsMock: vi.fn(),
}));

vi.mock("./useMultimodalWorkspace", () => ({
  useMultimodalWorkspace: useMultimodalWorkspaceMock,
}));

vi.mock("./useMultimodalPlaybackController", () => ({
  useMultimodalPlaybackController: useMultimodalPlaybackControllerMock,
}));

vi.mock("@fiftyone/commands", async () => {
  const actual = await vi.importActual<typeof import("@fiftyone/commands")>(
    "@fiftyone/commands"
  );

  return {
    ...actual,
    useKeyBindings: useKeyBindingsMock,
  };
});

vi.mock("./archetypes", () => ({
  Image2dView: ({
    alt,
    frame,
  }: {
    alt?: string;
    frame: { src: string } | null;
  }) => <img alt={alt} data-testid="image2d-view" src={frame?.src} />,
  Points3dView: ({ frame }: { frame: { pointCount: number } | null }) => (
    <div data-testid="points3d-view">{frame?.pointCount ?? 0}</div>
  ),
}));

vi.mock(
  "@fiftyone/playback/experimental/views/DurationTimelineControls",
  () => ({
    DurationTimelineControls: ({
      currentTime,
      duration,
    }: {
      currentTime: number;
      duration: number;
    }) => (
      <div data-testid="duration-timeline-controls">
        {currentTime} / {duration}
      </div>
    ),
  })
);

vi.mock("@fiftyone/playback", () => ({
  Timeline: ({ name }: { name: string }) => (
    <div data-testid="mcap-playback-timeline">{name}</div>
  ),
}));

const dataset = {
  id: "dataset-1",
  name: "multimodal-dataset",
} as const;
const schema = { filepath: { ftype: "StringField" } } as const;

const WORKSPACE_RESPONSE = {
  catalog: {
    sceneId: "scene-1",
    datasetId: "dataset-1",
    sampleId: "sample-1",
    mediaField: "filepath",
    mediaPath: "/tmp/sensors/drive.mcap",
    sourceKind: "mcap",
    catalogVersion: "multimodal-workspace-v1",
    timeRange: { startNs: 10, endNs: 20_000_000_010 },
    streams: [
      {
        streamId: "/camera/front",
        topic: "/camera/front",
        schemaName: "sensor_msgs/msg/CompressedImage",
        schemaEncoding: "ros2msg",
        messageEncoding: "cdr",
        kind: "image",
        frameId: "camera_front",
        affordances: ["image"],
        compatiblePanels: ["image"],
        channelId: 1,
        schemaId: 1,
        timeRange: { startNs: 10, endNs: 20_000_000_010 },
        messageCount: 3,
      },
      {
        streamId: "/camera/left",
        topic: "/camera/left",
        schemaName: "sensor_msgs/msg/CompressedImage",
        schemaEncoding: "ros2msg",
        messageEncoding: "cdr",
        kind: "image",
        frameId: "camera_left",
        affordances: ["image"],
        compatiblePanels: ["image"],
        channelId: 4,
        schemaId: 4,
        timeRange: { startNs: 10, endNs: 20_000_000_010 },
        messageCount: 3,
      },
      {
        streamId: "/camera/right",
        topic: "/camera/right",
        schemaName: "sensor_msgs/msg/CompressedImage",
        schemaEncoding: "ros2msg",
        messageEncoding: "cdr",
        kind: "image",
        frameId: "camera_right",
        affordances: ["image"],
        compatiblePanels: ["image"],
        channelId: 5,
        schemaId: 5,
        timeRange: { startNs: 10, endNs: 20_000_000_010 },
        messageCount: 3,
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
        timeRange: { startNs: 15, endNs: 20_000_000_010 },
        messageCount: 2,
      },
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
        timeRange: { startNs: 10, endNs: 20_000_000_010 },
        messageCount: 4,
      },
    ],
    frames: [{ frameId: "camera_front" }, { frameId: "map" }],
    transforms: [
      {
        topic: "/tf",
        parentFrameId: "map",
        childFrameId: "camera_front",
        isStatic: false,
      },
    ],
    locationTopics: [],
  },
  renderingPlan: {
    sceneId: "scene-1",
    mediaField: "filepath",
    sync: {
      timestampSource: "header.stamp",
      fallback: "log_time",
      mode: "nearest",
    },
    panels: [
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
        layout: { x: 0, y: 0, w: 12, h: 2 },
      },
      {
        panelId: "image_panel_1",
        archetype: "image",
        title: "Image panel 1",
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
        layout: { x: 0, y: 2, w: 4, h: 1 },
      },
      {
        panelId: "image_panel_2",
        archetype: "image",
        title: "Image panel 2",
        renderStreamId: "/camera/left",
        visibleStreamIds: [],
        frameConfig: {
          fixedFrameId: null,
          displayFrameId: null,
          followMode: "off",
          locationStreamId: null,
          enuFrameId: null,
        },
        sceneConfig: { upAxis: "z", backgroundColor: "#10151d" },
        layout: { x: 4, y: 2, w: 4, h: 1 },
      },
      {
        panelId: "image_panel_3",
        archetype: "image",
        title: "Image panel 3",
        renderStreamId: "/camera/right",
        visibleStreamIds: [],
        frameConfig: {
          fixedFrameId: null,
          displayFrameId: null,
          followMode: "off",
          locationStreamId: null,
          enuFrameId: null,
        },
        sceneConfig: { upAxis: "z", backgroundColor: "#10151d" },
        layout: { x: 8, y: 2, w: 4, h: 1 },
      },
    ],
  },
} as const;

function createWorkspaceHookState(overrides = {}) {
  return {
    data: WORKSPACE_RESPONSE,
    catalog: WORKSPACE_RESPONSE.catalog,
    renderingPlan: WORKSPACE_RESPONSE.renderingPlan,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function createPlaybackState(overrides = {}) {
  return {
    timelineName: "multimodal:scene-1",
    timeline: {
      sceneId: "scene-1",
      timestampSource: "header.stamp",
      timestampsNs: [10, 20],
      streams: [
        {
          streamId: "/camera/front",
          timestampsNs: [10, 20],
          samples: [
            {
              timestampNs: 10,
              logTimeNs: 10,
              publishTimeNs: 11,
            },
            {
              timestampNs: 20,
              logTimeNs: 20,
              publishTimeNs: 21,
            },
          ],
        },
        {
          streamId: "/lidar/top",
          timestampsNs: [10, 20],
          samples: [
            {
              timestampNs: 10,
              logTimeNs: 10,
              publishTimeNs: 11,
            },
            {
              timestampNs: 20,
              logTimeNs: 20,
              publishTimeNs: 21,
            },
          ],
        },
        {
          streamId: "/camera/left",
          timestampsNs: [10, 20],
          samples: [
            {
              timestampNs: 10,
              logTimeNs: 10,
              publishTimeNs: 11,
            },
            {
              timestampNs: 20,
              logTimeNs: 20,
              publishTimeNs: 21,
            },
          ],
        },
        {
          streamId: "/camera/right",
          timestampsNs: [10, 20],
          samples: [
            {
              timestampNs: 10,
              logTimeNs: 10,
              publishTimeNs: 11,
            },
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
    isTimelineInitialized: true,
    hasPlayback: true,
    timelineState: {
      name: "multimodal:scene-1",
      isInitialized: true,
      hasPlayback: true,
      playState: "paused",
      currentTimeNs: 10,
      durationNs: 20,
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
    },
    panelStates: {
      image_panel_1: {
        status: "ready",
        archetype: "image",
        statusDetail: null,
        imageFrame: {
          id: "frame-1",
          src: "blob:frame-1",
          timestampNs: 10,
        },
        sceneFrame: null,
        colorMode: "rgb",
        followPose: null,
        messageIds: ["frame-1"],
        logTimeNs: 10,
        publishTimeNs: 10,
        warnings: [],
        error: null,
      },
      image_panel_2: {
        status: "ready",
        archetype: "image",
        statusDetail: null,
        imageFrame: {
          id: "frame-2",
          src: "blob:frame-2",
          timestampNs: 10,
        },
        sceneFrame: null,
        colorMode: "rgb",
        followPose: null,
        messageIds: ["frame-2"],
        logTimeNs: 10,
        publishTimeNs: 10,
        warnings: [],
        error: null,
      },
      image_panel_3: {
        status: "ready",
        archetype: "image",
        statusDetail: null,
        imageFrame: {
          id: "frame-3",
          src: "blob:frame-3",
          timestampNs: 10,
        },
        sceneFrame: null,
        colorMode: "rgb",
        followPose: null,
        messageIds: ["frame-3"],
        logTimeNs: 10,
        publishTimeNs: 10,
        warnings: [],
        error: null,
      },
      panel_3d_1: {
        status: "ready",
        archetype: "3d",
        statusDetail: null,
        imageFrame: null,
        sceneFrame: {
          id: "cloud-1",
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
              intensity: null,
              colors: null,
              solidColor: null,
              pointSize: null,
            },
          ],
        },
        colorMode: "rgb",
        followPose: null,
        messageIds: ["cloud-1"],
        logTimeNs: 10,
        publishTimeNs: 10,
        warnings: [],
        error: null,
      },
    },
    ...overrides,
  };
}

function createCtx(surface: "grid" | "modal", sampleId = "sample-1") {
  return createSampleRendererRenderContext(
    {
      sample: {
        _id: sampleId,
        filepath: "/tmp/sensors/drive.mcap",
        media_type: "unknown",
      },
      urls: [{ field: "filepath", url: "/tmp/sensors/drive.mcap" }],
    },
    "filepath",
    dataset as any,
    schema as any,
    surface
  ) as SampleRendererRenderContext;
}

describe("Multimodal renderers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMultimodalWorkspaceMock.mockReturnValue(createWorkspaceHookState());
    useMultimodalPlaybackControllerMock.mockReturnValue(createPlaybackState());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the modal loading state inside the workspace shell", () => {
    useMultimodalWorkspaceMock.mockReturnValue(
      createWorkspaceHookState({
        data: null,
        catalog: null,
        renderingPlan: null,
        isLoading: true,
      })
    );

    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    expect(screen.getByTestId("multimodal-shell-loading")).toBeTruthy();
    expect(screen.getByText("Loading workspace")).toBeTruthy();
  });

  it("renders the foxglove-style shell with toolbar and floating timeline", () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    expect(screen.getByTestId("multimodal-workspace-shell")).toBeTruthy();
    expect(screen.getByTestId("multimodal-workspace-sidebar")).toBeTruthy();
    expect(screen.getByTestId("multimodal-workspace-main")).toBeTruthy();
    expect(screen.getByTestId("multimodal-workspace-grid")).toBeTruthy();
    expect(screen.getByTestId("multimodal-workspace-timeline")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "3D" })).toBeTruthy();
  });

  it("lays out the default workspace with a 3d hero row above three image tiles", () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    expect(
      screen.getByTestId("multimodal-panel-card-panel_3d_1").style.gridColumn
    ).toBe("1 / span 12");
    expect(
      screen.getByTestId("multimodal-panel-card-panel_3d_1").style.gridRow
    ).toBe("1 / span 2");
    expect(
      screen.getByTestId("multimodal-panel-card-image_panel_1").style.gridColumn
    ).toBe("1 / span 4");
    expect(
      screen.getByTestId("multimodal-panel-card-image_panel_2").style.gridColumn
    ).toBe("5 / span 4");
    expect(
      screen.getByTestId("multimodal-panel-card-image_panel_3").style.gridColumn
    ).toBe("9 / span 4");
    expect(
      screen.getByTestId("multimodal-panel-card-image_panel_1").style.gridRow
    ).toBe("3 / span 1");
  });

  it("shows stream schemas in the sidebar instead of internal stream kinds", async () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(screen.getByRole("button", { name: "Streams" }));

    await waitFor(() => {
      expect(screen.getByText("sensor_msgs/msg/PointCloud2")).toBeTruthy();
    });

    expect(screen.queryByText("other")).toBeNull();
  });

  it("starts dense config sections collapsed and expands them on demand", async () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    const frameConfigButton = screen.getByRole("button", {
      name: "Frame config",
    });

    expect(frameConfigButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Fixed frame")).toBeNull();

    fireEvent.click(frameConfigButton);

    await waitFor(() => {
      expect(frameConfigButton.getAttribute("aria-expanded")).toBe("true");
    });

    expect(screen.getByText("Fixed frame")).toBeTruthy();
  });

  it("adds an unbound image panel from the toolbar", async () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(screen.getByText("Image"));

    await waitFor(() => {
      expect(screen.getAllByText("Image panel").length).toBeGreaterThan(1);
    });
  });

  it("collapses the left sidebar from the toolbar", async () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(screen.getByRole("button", { name: "Hide sidebar" }));

    await waitFor(() => {
      expect(screen.queryByTestId("multimodal-workspace-sidebar")).toBeNull();
    });

    expect(screen.getByRole("button", { name: "Show sidebar" })).toBeTruthy();
  });

  it("keeps rendering the last 3d frame while playback updates in the background", () => {
    const playbackState = createPlaybackState();
    useMultimodalPlaybackControllerMock.mockReturnValue(
      createPlaybackState({
        panelStates: {
          ...playbackState.panelStates,
          panel_3d_1: {
            ...playbackState.panelStates.panel_3d_1,
            status: "loading",
          },
        },
      })
    );

    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    expect(screen.getByTestId("points3d-view")).toBeTruthy();
    expect(screen.queryByText("Buffering panel data")).toBeNull();
  });

  it("renders a more informative initial panel loading state", () => {
    const playbackState = createPlaybackState();
    useMultimodalPlaybackControllerMock.mockReturnValue(
      createPlaybackState({
        isLoading: true,
        panelStates: {
          ...playbackState.panelStates,
          image_panel_1: {
            ...playbackState.panelStates.image_panel_1,
            status: "idle",
            statusDetail: "Waiting for synchronized timeline",
            imageFrame: null,
            messageIds: [],
          },
          panel_3d_1: {
            ...playbackState.panelStates.panel_3d_1,
            status: "idle",
            statusDetail: "Waiting for synchronized timeline",
            sceneFrame: null,
            messageIds: [],
          },
        },
      })
    );

    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    expect(screen.getAllByText("Loading synchronized timeline").length).toBe(2);
    expect(
      screen.getAllByText(
        "Aligning stream timestamps for synchronized playback"
      ).length
    ).toBe(2);
  });

  it("registers playback transport key bindings", async () => {
    const playbackState = createPlaybackState();
    useMultimodalPlaybackControllerMock.mockReturnValue(playbackState);

    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    const bindings = useKeyBindingsMock.mock.calls.at(-1)?.[1] ?? [];
    const byId = Object.fromEntries(
      bindings.map((binding: { commandId: string }) => [
        binding.commandId,
        binding,
      ])
    );

    expect(byId["fo.modal.multimodal.playback.toggle"]?.sequence).toBe("space");
    expect(byId["fo.modal.multimodal.playback.step-forward"]?.sequence).toBe(
      "."
    );
    expect(byId["fo.modal.multimodal.playback.step-backward"]?.sequence).toBe(
      "\\,"
    );

    await byId["fo.modal.multimodal.playback.toggle"].handler();
    await byId["fo.modal.multimodal.playback.step-forward"].handler();
    await byId["fo.modal.multimodal.playback.step-backward"].handler();

    expect(playbackState.timelineState.togglePlay).toHaveBeenCalled();
    expect(playbackState.timelineState.stepForward).toHaveBeenCalled();
    expect(playbackState.timelineState.stepBackward).toHaveBeenCalled();
  });

  it("maximizes a panel from the meatball menu", async () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(
      screen.getByTestId("multimodal-panel-menu-button-panel_3d_1")
    );
    fireEvent.click(screen.getByText("Maximize panel"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("multimodal-panel-card-image_panel_1")
      ).toBeNull();
    });

    expect(screen.getByTestId("multimodal-panel-card-panel_3d_1")).toBeTruthy();
  });

  it("closes a panel from the meatball menu", async () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(
      screen.getByTestId("multimodal-panel-menu-button-image_panel_1")
    );
    fireEvent.click(screen.getByText("Close panel"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("multimodal-panel-card-image_panel_1")
      ).toBeNull();
    });

    expect(screen.getByTestId("multimodal-panel-card-panel_3d_1")).toBeTruthy();
  });

  it("renders the grid summary against the workspace catalog", () => {
    render(<MultimodalGridRenderer ctx={createCtx("grid")} />);

    expect(screen.getByTestId("multimodal-grid-summary")).toBeTruthy();
    expect(screen.getByText("3 image")).toBeTruthy();
  });
});
