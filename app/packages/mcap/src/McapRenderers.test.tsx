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
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultimodalGridRenderer } from "./MultimodalGridRenderer";
import { MultimodalModalRenderer } from "./MultimodalModalRenderer";

const { useMultimodalWorkspaceMock } = vi.hoisted(() => ({
  useMultimodalWorkspaceMock: vi.fn(),
}));
const { useMultimodalTimelineIndexMock } = vi.hoisted(() => ({
  useMultimodalTimelineIndexMock: vi.fn(),
}));
const { useMultimodalPlaybackControllerMock } = vi.hoisted(() => ({
  useMultimodalPlaybackControllerMock: vi.fn(),
}));
const { useKeyBindingsMock } = vi.hoisted(() => ({
  useKeyBindingsMock: vi.fn(),
}));
const { imageBufferCacheHarness } = vi.hoisted(() => ({
  imageBufferCacheHarness: {
    decodeMessage: vi.fn(),
    dispose: vi.fn(),
    ensureRange: vi.fn(),
    getMessageForLogTime: vi.fn(),
    instances: [] as unknown[],
    lastConstructorArgs: null as Record<string, unknown> | null,
    primeMessages: vi.fn(),
    warmMessagesAroundLogTime: vi.fn(),
  },
}));
const { mosaicHarness } = vi.hoisted(() => ({
  mosaicHarness: {
    lastProps: null as null | {
      value: unknown;
      onChange?: (nextNode: unknown) => void;
      onRelease?: (nextNode: unknown) => void;
    },
  },
}));
const { fetchMultimodalBufferMock } = vi.hoisted(() => ({
  fetchMultimodalBufferMock: vi.fn(),
}));

vi.mock("./useMultimodalWorkspace", () => ({
  useMultimodalWorkspace: useMultimodalWorkspaceMock,
}));

vi.mock("./useMultimodalTimelineIndex", () => ({
  useMultimodalTimelineIndex: useMultimodalTimelineIndexMock,
}));

vi.mock("./useMultimodalPlaybackController", () => ({
  useMultimodalPlaybackController: useMultimodalPlaybackControllerMock,
}));

vi.mock("./api", () => ({
  fetchMultimodalBuffer: fetchMultimodalBufferMock,
}));

vi.mock("./image-buffer-cache", () => ({
  MultimodalImageBufferCache: class MultimodalImageBufferCache {
    constructor(options: Record<string, unknown>) {
      imageBufferCacheHarness.instances.push(this);
      imageBufferCacheHarness.lastConstructorArgs = options;
    }

    ensureRange(...args: unknown[]) {
      return imageBufferCacheHarness.ensureRange(...args);
    }

    getMessageForLogTime(...args: unknown[]) {
      return imageBufferCacheHarness.getMessageForLogTime(...args);
    }

    decodeMessage(...args: unknown[]) {
      return imageBufferCacheHarness.decodeMessage(...args);
    }

    primeMessages(...args: unknown[]) {
      return imageBufferCacheHarness.primeMessages(...args);
    }

    warmMessagesAroundLogTime(...args: unknown[]) {
      return imageBufferCacheHarness.warmMessagesAroundLogTime(...args);
    }

    dispose(...args: unknown[]) {
      return imageBufferCacheHarness.dispose(...args);
    }
  },
}));

vi.mock("react-mosaic-component", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");

  function renderMosaicNode(
    node: any,
    renderTile: (leaf: string, path: ("first" | "second")[]) => React.ReactNode,
    path: ("first" | "second")[] = []
  ): React.ReactNode {
    if (!node) {
      return null;
    }

    if (typeof node === "string") {
      return (
        <div
          data-testid={`mock-mosaic-leaf-${node}`}
          key={`${path.join(":")}:${node}`}
        >
          {renderTile(node, path)}
        </div>
      );
    }

    return (
      <div
        data-testid={`mock-mosaic-split-${path.join(":") || "root"}`}
        key={path.join(":") || "root"}
      >
        {renderMosaicNode(node.first, renderTile, [...path, "first"])}
        {renderMosaicNode(node.second, renderTile, [...path, "second"])}
      </div>
    );
  }

  return {
    Mosaic: ({
      onChange,
      onRelease,
      renderTile,
      value,
      zeroStateView,
    }: {
      onChange?: (nextNode: unknown) => void;
      onRelease?: (nextNode: unknown) => void;
      renderTile: (
        leaf: string,
        path: ("first" | "second")[]
      ) => React.ReactNode;
      value: unknown;
      zeroStateView?: React.ReactNode;
    }) => {
      mosaicHarness.lastProps = { value, onChange, onRelease };

      return (
        <div data-testid="multimodal-workspace-mosaic">
          {value ? renderMosaicNode(value, renderTile) : zeroStateView ?? null}
        </div>
      );
    },
    MosaicWindow: ({
      children,
      path,
      renderToolbar,
      title,
    }: {
      children: React.ReactNode;
      path: ("first" | "second")[];
      renderToolbar?: (
        props: { path: ("first" | "second")[]; title: string },
        draggable: boolean
      ) => React.ReactNode;
      title: string;
    }) => (
      <div data-testid={`mock-mosaic-window-${title}`}>
        <div>
          {renderToolbar ? renderToolbar({ path, title }, true) : title}
        </div>
        <div>{children}</div>
      </div>
    ),
  };
});

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
  Points3dView: ({
    frame,
    showGrid,
  }: {
    frame: { pointCount: number } | null;
    showGrid?: boolean;
  }) => (
    <div data-show-grid={String(showGrid ?? true)} data-testid="points3d-view">
      {frame?.pointCount ?? 0}
    </div>
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
    catalogVersion: "multimodal-workspace-v4",
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
    sourceKind: "mcap",
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
        sceneConfig: {
          upAxis: "z",
          backgroundColor: "#10151d",
          showGrid: true,
        },
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
        sceneConfig: {
          upAxis: "z",
          backgroundColor: "#10151d",
          showGrid: true,
        },
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
        sceneConfig: {
          upAxis: "z",
          backgroundColor: "#10151d",
          showGrid: true,
        },
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
        sceneConfig: {
          upAxis: "z",
          backgroundColor: "#10151d",
          showGrid: true,
        },
      },
    ],
    layoutTree: {
      type: "split",
      direction: "column",
      splitPercentage: 50,
      first: {
        type: "split",
        direction: "row",
        splitPercentage: 50,
        first: { type: "leaf", panelId: "panel_3d_1" },
        second: { type: "leaf", panelId: "image_panel_1" },
      },
      second: {
        type: "split",
        direction: "row",
        splitPercentage: 50,
        first: { type: "leaf", panelId: "image_panel_2" },
        second: { type: "leaf", panelId: "image_panel_3" },
      },
    },
  },
} as const;

function createWorkspaceHookState(overrides = {}) {
  const catalog = overrides.catalog ?? WORKSPACE_RESPONSE.catalog;
  const renderingPlan =
    overrides.renderingPlan ?? WORKSPACE_RESPONSE.renderingPlan;

  return {
    data: overrides.data ?? {
      catalog,
      renderingPlan,
    },
    catalog,
    renderingPlan,
    isLoading: false,
    isSaving: false,
    error: null,
    saveError: null,
    refetch: vi.fn(),
    save: vi.fn().mockResolvedValue(WORKSPACE_RESPONSE.renderingPlan),
    clearSaveError: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function createWorkspaceResponse(overrides = {}) {
  return {
    ...WORKSPACE_RESPONSE,
    ...overrides,
    catalog: {
      ...WORKSPACE_RESPONSE.catalog,
      ...(overrides as { catalog?: typeof WORKSPACE_RESPONSE.catalog }).catalog,
    },
    renderingPlan: {
      ...WORKSPACE_RESPONSE.renderingPlan,
      ...(
        overrides as {
          renderingPlan?: typeof WORKSPACE_RESPONSE.renderingPlan;
        }
      ).renderingPlan,
    },
  };
}

function createPlaybackState(overrides = {}) {
  return {
    timelineName: "multimodal:scene-1",
    timeline: {
      sceneId: "scene-1",
      timestampSource: "header.stamp",
      timestampsNs: [10, 20],
      streams: [],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isTimelineInitialized: true,
    hasPlayback: true,
    canControlPlayback: true,
    timelineState: {
      name: "multimodal:scene-1",
      isInitialized: true,
      hasPlayback: true,
      canControlPlayback: true,
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

function createTimelineIndexState(overrides = {}) {
  return {
    data: null,
    timeline: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function createCtx(surface: "grid" | "modal", sampleId = "sample-1") {
  return createSampleRendererRenderContext(
    {
      sample: {
        _id: sampleId,
        filepath: "/tmp/sensors/drive.mcap",
        metadata: {
          size_bytes: 268_435_456,
        } as any,
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
    mosaicHarness.lastProps = null;
    imageBufferCacheHarness.instances = [];
    imageBufferCacheHarness.lastConstructorArgs = null;
    imageBufferCacheHarness.ensureRange.mockResolvedValue(undefined);
    imageBufferCacheHarness.getMessageForLogTime.mockImplementation(
      (logTimeNs: number) => ({
        messageId: `preview-message-${logTimeNs}`,
        syncTimestampNs: logTimeNs,
        logTimeNs,
        publishTimeNs: logTimeNs,
        payload: new Uint8Array(),
      })
    );
    imageBufferCacheHarness.decodeMessage.mockResolvedValue({
      id: "preview-frame-1",
      messageId: "preview-message-10",
      format: "jpeg",
      frameId: "camera_front",
      src: "blob:preview-frame-1",
      timestampNs: 10,
      logTimeNs: 10,
      publishTimeNs: 10,
      objectUrl: "blob:preview-frame-1",
    });
    imageBufferCacheHarness.primeMessages.mockReturnValue(undefined);
    imageBufferCacheHarness.warmMessagesAroundLogTime.mockResolvedValue(
      undefined
    );
    imageBufferCacheHarness.dispose.mockReturnValue(undefined);
    fetchMultimodalBufferMock.mockResolvedValue({
      sceneId: "scene-1",
      window: { startTimeNs: 10, endTimeNs: 20 },
      streams: [
        {
          streamId: "/camera/front",
          schemaName: "sensor_msgs/msg/CompressedImage",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "preview-message-10",
              logTimeNs: 10,
              publishTimeNs: 11,
              payload: new Uint8Array([1]),
            },
          ],
        },
      ],
    });
    useMultimodalWorkspaceMock.mockReturnValue(createWorkspaceHookState());
    useMultimodalTimelineIndexMock.mockReturnValue(createTimelineIndexState());
    useMultimodalPlaybackControllerMock.mockReturnValue(createPlaybackState());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

  it("renders the compact mosaic workspace shell", () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    expect(screen.getByTestId("multimodal-workspace-shell")).toBeTruthy();
    expect(screen.getByTestId("multimodal-workspace-sidebar")).toBeTruthy();
    expect(screen.getByTestId("multimodal-workspace-main")).toBeTruthy();
    expect(screen.getByTestId("multimodal-workspace-mosaic")).toBeTruthy();
    expect(screen.getByTestId("multimodal-workspace-timeline")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "3D" })).toBeTruthy();
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

  it("toggles the 3d grid from scene config", async () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(screen.getByRole("button", { name: "Scene config" }));

    await waitFor(() => {
      expect(screen.getByLabelText("show-grid")).toBeTruthy();
    });

    expect(
      screen.getByTestId("points3d-view").getAttribute("data-show-grid")
    ).toBe("true");

    fireEvent.click(screen.getByLabelText("show-grid"));

    await waitFor(() => {
      expect(
        screen.getByTestId("points3d-view").getAttribute("data-show-grid")
      ).toBe("false");
    });
  });

  it("persists the image-panel projected 3d overlay toggle from the sidebar", async () => {
    vi.useFakeTimers();
    const imageOnlyRenderingPlan = {
      ...WORKSPACE_RESPONSE.renderingPlan,
      panels: [
        {
          ...WORKSPACE_RESPONSE.renderingPlan.panels[1],
        },
      ],
      layoutTree: {
        type: "leaf" as const,
        panelId: "image_panel_1",
      },
    };
    const save = vi.fn().mockResolvedValue(imageOnlyRenderingPlan);
    useMultimodalWorkspaceMock.mockReturnValue(
      createWorkspaceHookState({
        renderingPlan: imageOnlyRenderingPlan,
        save,
      })
    );

    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(screen.getByRole("button", { name: "Streams" }));
    const overlayToggle = screen.getByLabelText(
      "project-3d-overlays"
    ) as HTMLInputElement;
    expect(overlayToggle.checked).toBe(false);

    fireEvent.click(overlayToggle);
    expect(
      (screen.getByLabelText("project-3d-overlays") as HTMLInputElement).checked
    ).toBe(true);

    await vi.advanceTimersByTimeAsync(250);

    expect(save).toHaveBeenCalledTimes(1);

    expect(save.mock.calls.at(-1)?.[0]).toMatchObject({
      panels: [
        expect.objectContaining({
          panelId: "image_panel_1",
          imageConfig: {
            project3dOverlays: true,
          },
        }),
      ],
    });
  });

  it("adds an unbound image panel from the toolbar and schedules a save", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(WORKSPACE_RESPONSE.renderingPlan);
    useMultimodalWorkspaceMock.mockReturnValue(
      createWorkspaceHookState({
        save,
      })
    );

    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(screen.getByText("Image"));
    await vi.runAllTimersAsync();

    expect(
      screen.getByTestId("multimodal-panel-card-image_panel_4")
    ).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("collapses the left sidebar from the sidebar header", async () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(
      within(screen.getByTestId("multimodal-workspace-sidebar")).getByRole(
        "button",
        { name: "Hide sidebar" }
      )
    );

    await waitFor(() => {
      expect(screen.queryByTestId("multimodal-workspace-sidebar")).toBeNull();
    });

    expect(screen.getByRole("button", { name: "Show sidebar" })).toBeTruthy();
  });

  it("enters sidebar resize mode and saves on release", async () => {
    const save = vi.fn().mockResolvedValue(WORKSPACE_RESPONSE.renderingPlan);
    useMultimodalWorkspaceMock.mockReturnValue(
      createWorkspaceHookState({
        save,
      })
    );

    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);
    await Promise.resolve();

    const shell = screen.getByTestId("multimodal-workspace-shell");
    const resizer = screen.getByTestId("multimodal-workspace-sidebar-resizer");
    const PointerEventCtor = window.PointerEvent ?? MouseEvent;
    fireEvent.pointerDown(resizer, {
      clientX: 208,
    });
    expect(document.body.style.cursor).toBe("col-resize");
    expect(document.body.style.userSelect).toBe("none");

    fireEvent(
      window,
      new PointerEventCtor("pointermove", {
        bubbles: true,
        clientX: 288,
      })
    );

    fireEvent(
      window,
      new PointerEventCtor("pointerup", {
        bubbles: true,
      })
    );

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    expect(shell.style.gridTemplateColumns).toBe("208px 8px minmax(0, 1fr)");
  });

  it("does not repeat scene stats in the sidebar header", () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    expect(screen.queryByText("5 streams · 20 s")).toBeNull();
  });

  it("maximizes and restores a panel from the compact toolbar", async () => {
    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Maximize panel lidar" })
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId("multimodal-panel-card-image_panel_1")
      ).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Restore panel" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("multimodal-panel-card-image_panel_1")
      ).toBeTruthy();
    });
  });

  it("closes a panel from the compact toolbar", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(WORKSPACE_RESPONSE.renderingPlan);
    useMultimodalWorkspaceMock.mockReturnValue(
      createWorkspaceHookState({
        save,
      })
    );

    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(screen.getByRole("button", { name: "Close panel camera" }));
    await vi.runAllTimersAsync();

    expect(
      screen.queryByTestId("multimodal-panel-card-image_panel_1")
    ).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves immediately when mosaic releases a rearranged layout", async () => {
    const save = vi.fn().mockResolvedValue(WORKSPACE_RESPONSE.renderingPlan);
    useMultimodalWorkspaceMock.mockReturnValue(
      createWorkspaceHookState({
        save,
      })
    );

    render(<MultimodalModalRenderer ctx={createCtx("modal")} />);

    mosaicHarness.lastProps?.onRelease?.({
      direction: "row",
      splitPercentage: 50,
      first: "image_panel_1",
      second: "panel_3d_1",
    });

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
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

  it("renders file size, scene duration, and total streams in the grid summary", () => {
    render(<MultimodalGridRenderer ctx={createCtx("grid")} />);

    expect(screen.getByTestId("multimodal-grid-summary")).toBeTruthy();
    expect(
      screen.getByTestId("multimodal-grid-stat-file-size").textContent
    ).toContain("256 MB");
    expect(
      screen.getByTestId("multimodal-grid-stat-duration").textContent
    ).toContain("20 s");
    expect(
      screen.getByTestId("multimodal-grid-stat-streams").textContent
    ).toContain("5");
  });

  it("plays the first compressed image stream on hover", async () => {
    useMultimodalTimelineIndexMock.mockReturnValue(
      createTimelineIndexState({
        timeline: {
          sceneId: "scene-1",
          timestampSource: "header.stamp",
          timestampsNs: [10, 20],
          streams: [
            {
              streamId: "/camera/front",
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
      })
    );
    fetchMultimodalBufferMock.mockResolvedValue({
      sceneId: "scene-1",
      window: { startTimeNs: 10, endTimeNs: 20 },
      streams: [
        {
          streamId: "/camera/front",
          schemaName: "sensor_msgs/msg/CompressedImage",
          messageEncoding: "cdr",
          messages: [
            {
              messageId: "preview-message-10",
              logTimeNs: 10,
              publishTimeNs: 11,
              payload: new Uint8Array([1]),
            },
            {
              messageId: "preview-message-20",
              logTimeNs: 20,
              publishTimeNs: 21,
              payload: new Uint8Array([2]),
            },
          ],
        },
      ],
    });
    imageBufferCacheHarness.decodeMessage
      .mockResolvedValueOnce({
        id: "preview-frame-1",
        messageId: "preview-message-10",
        format: "jpeg",
        frameId: "camera_front",
        src: "blob:preview-frame-1",
        timestampNs: 10,
        logTimeNs: 10,
        publishTimeNs: 10,
        objectUrl: "blob:preview-frame-1",
      })
      .mockResolvedValueOnce({
        id: "preview-frame-2",
        messageId: "preview-message-20",
        format: "jpeg",
        frameId: "camera_front",
        src: "blob:preview-frame-2",
        timestampNs: 20,
        logTimeNs: 20,
        publishTimeNs: 20,
        objectUrl: "blob:preview-frame-2",
      });

    render(<MultimodalGridRenderer ctx={createCtx("grid")} />);

    fireEvent.mouseEnter(screen.getByTestId("multimodal-grid-renderer"));

    await waitFor(() => {
      expect(
        screen.getByTestId("multimodal-grid-hover-preview").getAttribute("src")
      ).toBe("blob:preview-frame-1");
    });

    expect(imageBufferCacheHarness.lastConstructorArgs?.streamId).toBe(
      "/camera/front"
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("multimodal-grid-hover-preview").getAttribute("src")
      ).toBe("blob:preview-frame-2");
    });
  });

  it("does not start a hover preview when no compressed image stream is available", async () => {
    const pointcloudOnlyWorkspace = createWorkspaceResponse({
      catalog: {
        ...WORKSPACE_RESPONSE.catalog,
        streams: [WORKSPACE_RESPONSE.catalog.streams[3]],
        frames: [{ frameId: "map" }],
      },
      renderingPlan: {
        ...WORKSPACE_RESPONSE.renderingPlan,
        panels: [WORKSPACE_RESPONSE.renderingPlan.panels[0]],
        layoutTree: { type: "leaf", panelId: "panel_3d_1" },
      },
    });
    useMultimodalWorkspaceMock.mockReturnValue(
      createWorkspaceHookState(pointcloudOnlyWorkspace)
    );

    render(<MultimodalGridRenderer ctx={createCtx("grid")} />);

    fireEvent.mouseEnter(screen.getByTestId("multimodal-grid-renderer"));

    await waitFor(() => {
      expect(screen.queryByTestId("multimodal-grid-hover-preview")).toBeNull();
    });

    expect(imageBufferCacheHarness.lastConstructorArgs).toBeNull();
  });
});
