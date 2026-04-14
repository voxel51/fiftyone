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
import type { McapSceneOpenResponse } from "./types";
import { McapGridRenderer } from "./McapGridRenderer";
import { McapModalRenderer } from "./McapModalRenderer";

const { useMcapSceneMock } = vi.hoisted(() => ({
  useMcapSceneMock: vi.fn(),
}));
const { useMcapPlaybackControllerMock } = vi.hoisted(() => ({
  useMcapPlaybackControllerMock: vi.fn(),
}));

vi.mock("./useMcapScene", () => ({
  useMcapScene: useMcapSceneMock,
}));

vi.mock("./useMcapPlaybackController", () => ({
  useMcapPlaybackController: useMcapPlaybackControllerMock,
}));

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

const SCENE_RESPONSE: McapSceneOpenResponse = {
  scene: {
    sceneId: "scene-1",
    datasetId: "dataset-1",
    sampleId: "sample-1",
    mediaField: "filepath",
    mediaPath: "/tmp/sensors/drive.mcap",
    timeRange: { startNs: 10, endNs: 20_000_000_010 },
    streams: [
      {
        streamId: "/camera/front",
        topic: "/camera/front",
        schemaName: "sensor_msgs/msg/CompressedImage",
        schemaEncoding: "ros2msg",
        messageEncoding: "cdr",
        role: "image_stream",
        channelId: 1,
        schemaId: 1,
        timeRange: { startNs: 10, endNs: 20_000_000_010 },
        messageCount: 3,
      },
      {
        streamId: "/lidar/top",
        topic: "/lidar/top",
        schemaName: "sensor_msgs/msg/PointCloud2",
        schemaEncoding: "ros2msg",
        messageEncoding: "cdr",
        role: "pointcloud_stream",
        channelId: 2,
        schemaId: 2,
        timeRange: { startNs: 15, endNs: 20_000_000_010 },
        messageCount: 2,
      },
    ],
  },
  playbackPlan: {
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
  },
};

const SECOND_SCENE_RESPONSE: McapSceneOpenResponse = {
  scene: {
    ...SCENE_RESPONSE.scene,
    sceneId: "scene-2",
    sampleId: "sample-2",
    streams: [
      {
        ...SCENE_RESPONSE.scene.streams[0],
        streamId: "/camera/rear",
        topic: "/camera/rear",
      },
      SCENE_RESPONSE.scene.streams[1],
    ],
  },
  playbackPlan: {
    ...SCENE_RESPONSE.playbackPlan,
    sceneId: "scene-2",
    panels: [
      {
        panelId: "camera_rear",
        panelType: "2d",
        contentType: "image",
        streamId: "/camera/rear",
      },
      SCENE_RESPONSE.playbackPlan.panels[1],
    ],
  },
};

function createHookState(
  overrides: Partial<ReturnType<typeof useMcapSceneMock>> = {}
) {
  return {
    data: null,
    scene: null,
    playbackPlan: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function createPlaybackState(
  overrides: Partial<ReturnType<typeof useMcapPlaybackControllerMock>> = {}
) {
  return {
    timelineName: null,
    timeline: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isTimelineInitialized: false,
    hasPlayback: false,
    panelStates: {},
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

describe("Mcap renderers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMcapPlaybackControllerMock.mockReturnValue(createPlaybackState());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the modal loading state inside the shell", () => {
    useMcapSceneMock.mockReturnValue(
      createHookState({
        isLoading: true,
      })
    );

    render(<McapModalRenderer ctx={createCtx("modal")} />);

    expect(screen.getByTestId("mcap-shell-left")).toBeTruthy();
    expect(screen.getByTestId("mcap-shell-center")).toBeTruthy();
    expect(screen.getByTestId("mcap-shell-right")).toBeTruthy();
    expect(screen.getByTestId("mcap-shell-loading")).toBeTruthy();
    expect(screen.getByText("Loading scene")).toBeTruthy();
  });

  it("renders modal panel cards in playback-plan order", () => {
    useMcapSceneMock.mockReturnValue(
      createHookState({
        data: SCENE_RESPONSE,
        scene: SCENE_RESPONSE.scene,
        playbackPlan: SCENE_RESPONSE.playbackPlan,
      })
    );
    useMcapPlaybackControllerMock.mockReturnValue(
      createPlaybackState({
        timelineName: "mcap:scene-1",
        timeline: {
          timestampSource: "log_time",
          timestampsNs: [10, 20],
          streams: [
            {
              streamId: "/camera/front",
              timestampsNs: [10, 20],
            },
            {
              streamId: "/lidar/top",
              timestampsNs: [10, 20],
            },
          ],
        },
        hasPlayback: true,
        isTimelineInitialized: true,
        panelStates: {
          camera_front: {
            status: "ready",
            archetype: "image2d",
            messageId: "frame-1",
            logTimeNs: 10,
            publishTimeNs: 10,
            error: null,
            frame: {
              id: "frame-1",
              src: "blob:front",
              timestampNs: 10,
              format: "jpeg",
              logTimeNs: 10,
              objectUrl: "blob:front",
            },
          },
          lidar_top: {
            status: "ready",
            archetype: "points3d",
            messageId: "cloud-1",
            logTimeNs: 15,
            publishTimeNs: 15,
            error: null,
            frame: {
              id: "cloud-1",
              pointCount: 2,
              positions: new Float32Array([0, 0, 0, 1, 1, 1]),
              intensity: null,
              bounds: {
                min: [0, 0, 0],
                max: [1, 1, 1],
              },
            },
          },
        },
      })
    );

    render(<McapModalRenderer ctx={createCtx("modal")} />);

    const panelCards = Array.from(
      screen
        .getByTestId("mcap-shell-panels")
        .querySelectorAll('[data-testid^="mcap-panel-card-"]')
    ) as HTMLElement[];

    expect(panelCards[0].getAttribute("data-testid")).toBe(
      "mcap-panel-card-camera_front"
    );
    expect(panelCards[1].getAttribute("data-testid")).toBe(
      "mcap-panel-card-lidar_top"
    );
    expect(within(panelCards[0]).getByText("camera/front")).toBeTruthy();
    expect(within(panelCards[1]).getByText("lidar/top")).toBeTruthy();
  });

  it("renders the first image frame, point cloud frame, and shared timeline strip", () => {
    useMcapSceneMock.mockReturnValue(
      createHookState({
        data: SCENE_RESPONSE,
        scene: SCENE_RESPONSE.scene,
        playbackPlan: SCENE_RESPONSE.playbackPlan,
      })
    );
    useMcapPlaybackControllerMock.mockReturnValue(
      createPlaybackState({
        timelineName: "mcap:scene-1",
        timeline: {
          timestampSource: "log_time",
          timestampsNs: [10, 20],
          streams: [
            {
              streamId: "/camera/front",
              timestampsNs: [10, 20],
            },
            {
              streamId: "/lidar/top",
              timestampsNs: [10, 20],
            },
          ],
        },
        hasPlayback: true,
        isTimelineInitialized: true,
        panelStates: {
          camera_front: {
            status: "ready",
            archetype: "image2d",
            messageId: "frame-1",
            logTimeNs: 10,
            publishTimeNs: 10,
            error: null,
            frame: {
              id: "frame-1",
              src: "blob:front",
              timestampNs: 10,
              format: "jpeg",
              logTimeNs: 10,
              objectUrl: "blob:front",
            },
          },
          lidar_top: {
            status: "ready",
            archetype: "points3d",
            messageId: "cloud-1",
            logTimeNs: 15,
            publishTimeNs: 15,
            error: null,
            frame: {
              id: "cloud-1",
              pointCount: 2,
              positions: new Float32Array([0, 0, 0, 1, 1, 1]),
              intensity: null,
              bounds: {
                min: [0, 0, 0],
                max: [1, 1, 1],
              },
            },
          },
        },
      })
    );

    render(<McapModalRenderer ctx={createCtx("modal")} />);

    expect(screen.getByTestId("mcap-playback-timeline").textContent).toContain(
      "mcap:scene-1"
    );
    expect(
      within(screen.getByTestId("mcap-image-frame-camera_front"))
        .getByTestId("image2d-view")
        .getAttribute("src")
    ).toBe("blob:front");
    expect(
      within(screen.getByTestId("mcap-points3d-frame-lidar_top")).getByTestId(
        "points3d-view"
      ).textContent
    ).toBe("2");
  });

  it("renders a pointcloud loading fallback while shared playback warms up", () => {
    useMcapSceneMock.mockReturnValue(
      createHookState({
        data: SCENE_RESPONSE,
        scene: SCENE_RESPONSE.scene,
        playbackPlan: SCENE_RESPONSE.playbackPlan,
      })
    );
    useMcapPlaybackControllerMock.mockReturnValue(
      createPlaybackState({
        hasPlayback: true,
        panelStates: {
          camera_front: {
            status: "loading",
            archetype: "image2d",
            messageId: null,
            logTimeNs: null,
            publishTimeNs: null,
            error: null,
            frame: null,
          },
          lidar_top: {
            status: "loading",
            archetype: "points3d",
            messageId: null,
            logTimeNs: null,
            publishTimeNs: null,
            error: null,
            frame: null,
          },
        },
      })
    );

    render(<McapModalRenderer ctx={createCtx("modal")} />);

    expect(screen.getByText("Point cloud playback")).toBeTruthy();
    const pointPanel = screen.getByTestId("mcap-panel-card-lidar_top");
    expect(
      within(pointPanel).getAllByText(
        "Loading point data for the shared playback cursor."
      ).length
    ).toBeGreaterThan(0);
  });

  it("renders a panel-local playback error when image decode fails", () => {
    useMcapSceneMock.mockReturnValue(
      createHookState({
        data: SCENE_RESPONSE,
        scene: SCENE_RESPONSE.scene,
        playbackPlan: SCENE_RESPONSE.playbackPlan,
      })
    );
    useMcapPlaybackControllerMock.mockReturnValue(
      createPlaybackState({
        timelineName: "mcap:scene-1",
        timeline: {
          timestampSource: "log_time",
          timestampsNs: [10],
          streams: [
            {
              streamId: "/camera/front",
              timestampsNs: [10],
            },
          ],
        },
        hasPlayback: true,
        panelStates: {
          camera_front: {
            status: "error",
            archetype: "image2d",
            messageId: null,
            logTimeNs: null,
            publishTimeNs: null,
            error: new Error("decode failed"),
            frame: null,
          },
        },
      })
    );

    render(<McapModalRenderer ctx={createCtx("modal")} />);

    const imagePanel = screen.getByTestId("mcap-panel-card-camera_front");
    expect(within(imagePanel).getByText("Playback error")).toBeTruthy();
    expect(within(imagePanel).getAllByText("decode failed").length).toBe(2);
  });

  it("renders an empty modal state for scenes without supported streams", () => {
    const emptyResponse: McapSceneOpenResponse = {
      ...SCENE_RESPONSE,
      scene: {
        ...SCENE_RESPONSE.scene,
        streams: [],
      },
      playbackPlan: {
        ...SCENE_RESPONSE.playbackPlan,
        panels: [],
      },
    };
    useMcapSceneMock.mockReturnValue(
      createHookState({
        data: emptyResponse,
        scene: emptyResponse.scene,
        playbackPlan: emptyResponse.playbackPlan,
      })
    );

    render(<McapModalRenderer ctx={createCtx("modal")} />);

    const emptyState = screen.getByTestId("mcap-shell-empty");

    expect(emptyState).toBeTruthy();
    expect(within(emptyState).getByText("No supported streams")).toBeTruthy();
  });

  it("renders a modal error state and retries locally", () => {
    const refetch = vi.fn();
    useMcapSceneMock.mockReturnValue(
      createHookState({
        error: new Error("boom"),
        refetch,
      })
    );

    render(<McapModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByTestId("mcap-shell-error")).toBeTruthy();
    expect(screen.getByText("Scene unavailable")).toBeTruthy();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("updates right-sidebar metadata when the active panel changes", () => {
    useMcapSceneMock.mockReturnValue(
      createHookState({
        data: SCENE_RESPONSE,
        scene: SCENE_RESPONSE.scene,
        playbackPlan: SCENE_RESPONSE.playbackPlan,
      })
    );

    render(<McapModalRenderer ctx={createCtx("modal")} />);

    const rightSidebar = screen.getByTestId("mcap-shell-right");
    expect(within(rightSidebar).getAllByText("/camera/front").length).toBe(2);

    fireEvent.click(screen.getByTestId("mcap-panel-nav-lidar_top"));

    expect(within(rightSidebar).getAllByText("/lidar/top").length).toBe(2);
  });

  it("resets the active panel when the scene changes", async () => {
    let hookState = createHookState({
      data: SCENE_RESPONSE,
      scene: SCENE_RESPONSE.scene,
      playbackPlan: SCENE_RESPONSE.playbackPlan,
    });
    useMcapSceneMock.mockImplementation(() => hookState);

    const { rerender } = render(<McapModalRenderer ctx={createCtx("modal")} />);

    fireEvent.click(screen.getByTestId("mcap-panel-nav-lidar_top"));
    expect(
      within(screen.getByTestId("mcap-shell-right")).getAllByText("/lidar/top")
        .length
    ).toBe(2);

    hookState = createHookState({
      data: SECOND_SCENE_RESPONSE,
      scene: SECOND_SCENE_RESPONSE.scene,
      playbackPlan: SECOND_SCENE_RESPONSE.playbackPlan,
    });
    rerender(<McapModalRenderer ctx={createCtx("modal", "sample-2")} />);

    await waitFor(() => {
      expect(
        within(screen.getByTestId("mcap-shell-right")).getAllByText(
          "/camera/rear"
        ).length
      ).toBe(2);
    });
  });

  it("renders a compact grid loading state", () => {
    useMcapSceneMock.mockReturnValue(
      createHookState({
        isLoading: true,
      })
    );

    render(<McapGridRenderer ctx={createCtx("grid")} />);

    expect(screen.getByTestId("mcap-grid-loading")).toBeTruthy();
    expect(screen.getByText("Loading inventory")).toBeTruthy();
  });

  it("renders grid inventory summary data", () => {
    useMcapSceneMock.mockReturnValue(
      createHookState({
        data: SCENE_RESPONSE,
        scene: SCENE_RESPONSE.scene,
      })
    );

    render(<McapGridRenderer ctx={createCtx("grid")} />);

    expect(screen.getByTestId("mcap-grid-summary")).toBeTruthy();
    expect(screen.getByText("1 image")).toBeTruthy();
    expect(screen.getByText("1 pointcloud")).toBeTruthy();
    expect(screen.getByText("20 s")).toBeTruthy();
    expect(screen.getByText("camera/front, lidar/top")).toBeTruthy();
  });

  it("renders a grid summary for empty supported streams", () => {
    const emptyResponse: McapSceneOpenResponse = {
      ...SCENE_RESPONSE,
      scene: {
        ...SCENE_RESPONSE.scene,
        streams: [],
      },
    };
    useMcapSceneMock.mockReturnValue(
      createHookState({
        data: emptyResponse,
        scene: emptyResponse.scene,
      })
    );

    render(<McapGridRenderer ctx={createCtx("grid")} />);

    expect(screen.getByTestId("mcap-grid-summary")).toBeTruthy();
    expect(screen.getByText("No supported streams")).toBeTruthy();
  });

  it("renders a grid error fallback without crashing", () => {
    useMcapSceneMock.mockReturnValue(
      createHookState({
        error: new Error("inventory unavailable"),
      })
    );

    render(<McapGridRenderer ctx={createCtx("grid")} />);

    expect(screen.getByTestId("mcap-grid-error")).toBeTruthy();
    expect(screen.getByText("Inventory unavailable")).toBeTruthy();
    expect(screen.getByText("/tmp/sensors/drive.mcap")).toBeTruthy();
  });
});
