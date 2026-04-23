import { describe, expect, it } from "vitest";
import {
  DEFAULT_MULTIMODAL_SIDEBAR_WIDTH_PX,
  addPanelToWorkspaceState,
  createBalancedLayoutTree,
  createRenderingPlanFromWorkspaceState,
  createWorkspaceStateFromRenderingPlan,
  getDefaultImageSupportStreamIds,
  retitleGenericPanelsInWorkspaceState,
  reconcileImageSupportStreamIds,
  removePanelFromWorkspaceState,
  setSidebarWidthInWorkspaceState,
} from "./workspace-state";

describe("workspace-state", () => {
  it("builds the expected default trees for 1 through 5 panels", () => {
    expect(createBalancedLayoutTree(["panel_1"])).toEqual({
      type: "leaf",
      panelId: "panel_1",
    });

    expect(createBalancedLayoutTree(["panel_1", "panel_2"])).toEqual({
      type: "split",
      direction: "row",
      splitPercentage: 50,
      first: { type: "leaf", panelId: "panel_1" },
      second: { type: "leaf", panelId: "panel_2" },
    });

    expect(createBalancedLayoutTree(["panel_1", "panel_2", "panel_3"])).toEqual(
      {
        type: "split",
        direction: "row",
        splitPercentage: 33,
        first: { type: "leaf", panelId: "panel_1" },
        second: {
          type: "split",
          direction: "column",
          splitPercentage: 50,
          first: { type: "leaf", panelId: "panel_2" },
          second: { type: "leaf", panelId: "panel_3" },
        },
      }
    );

    expect(
      createBalancedLayoutTree(["panel_1", "panel_2", "panel_3", "panel_4"])
    ).toEqual({
      type: "split",
      direction: "column",
      splitPercentage: 50,
      first: {
        type: "split",
        direction: "row",
        splitPercentage: 50,
        first: { type: "leaf", panelId: "panel_1" },
        second: { type: "leaf", panelId: "panel_2" },
      },
      second: {
        type: "split",
        direction: "row",
        splitPercentage: 50,
        first: { type: "leaf", panelId: "panel_3" },
        second: { type: "leaf", panelId: "panel_4" },
      },
    });

    expect(
      createBalancedLayoutTree([
        "panel_1",
        "panel_2",
        "panel_3",
        "panel_4",
        "panel_5",
      ])
    ).toEqual({
      type: "split",
      direction: "row",
      splitPercentage: 40,
      first: {
        type: "split",
        direction: "column",
        splitPercentage: 50,
        first: { type: "leaf", panelId: "panel_1" },
        second: { type: "leaf", panelId: "panel_2" },
      },
      second: {
        type: "split",
        direction: "column",
        splitPercentage: 33,
        first: { type: "leaf", panelId: "panel_3" },
        second: {
          type: "split",
          direction: "row",
          splitPercentage: 50,
          first: { type: "leaf", panelId: "panel_4" },
          second: { type: "leaf", panelId: "panel_5" },
        },
      },
    });
  });

  it("adds a panel by splitting the active tile", () => {
    const initialState = createWorkspaceStateFromRenderingPlan({
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
          panelId: "image_panel_1",
          archetype: "image",
          title: "Image panel 1",
          renderStreamId: null,
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
        type: "leaf",
        panelId: "image_panel_1",
      },
    });

    const nextState = addPanelToWorkspaceState(initialState, "3d", {
      targetPanelId: "image_panel_1",
      direction: "column",
    });

    expect(nextState.activePanelId).toBe("panel_3d_1");
    expect(nextState.layoutTree).toEqual({
      type: "split",
      direction: "column",
      splitPercentage: 50,
      first: { type: "leaf", panelId: "image_panel_1" },
      second: { type: "leaf", panelId: "panel_3d_1" },
    });
  });

  it("removes a panel and collapses the remaining tree", () => {
    const initialState = createWorkspaceStateFromRenderingPlan({
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
          panelId: "image_panel_1",
          archetype: "image",
          title: "Image panel 1",
          renderStreamId: null,
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
          panelId: "panel_3d_1",
          archetype: "3d",
          title: "3D panel 1",
          renderStreamId: null,
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
        direction: "row",
        splitPercentage: 50,
        first: { type: "leaf", panelId: "image_panel_1" },
        second: { type: "leaf", panelId: "panel_3d_1" },
      },
    });

    const nextState = removePanelFromWorkspaceState(
      initialState,
      "image_panel_1"
    );
    const renderingPlan = createRenderingPlanFromWorkspaceState(nextState);

    expect(nextState.activePanelId).toBe("panel_3d_1");
    expect(renderingPlan.layoutTree).toEqual({
      type: "leaf",
      panelId: "panel_3d_1",
    });
    expect(renderingPlan.panels).toHaveLength(1);
  });

  it("defaults and persists the sidebar width", () => {
    const initialState = createWorkspaceStateFromRenderingPlan({
      sceneId: "scene-1",
      mediaField: "filepath",
      sourceKind: "mcap",
      sync: {
        timestampSource: "header.stamp",
        fallback: "log_time",
        mode: "nearest",
      },
      panels: [],
      layoutTree: null,
    });

    expect(initialState.sidebarWidth).toBe(DEFAULT_MULTIMODAL_SIDEBAR_WIDTH_PX);

    const nextState = setSidebarWidthInWorkspaceState(initialState, 312);

    expect(createRenderingPlanFromWorkspaceState(nextState).sidebarWidth).toBe(
      312
    );
  });

  it("defaults image panels to disabled projected 3d overlays", () => {
    const workspaceState = createWorkspaceStateFromRenderingPlan({
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
          panelId: "image_panel_1",
          archetype: "image",
          title: "Image panel 1",
          renderStreamId: null,
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
        type: "leaf",
        panelId: "image_panel_1",
      },
    });

    expect(workspaceState.panels[0].imageConfig).toEqual({
      project3dOverlays: false,
    });
    expect(workspaceState.panelsById.image_panel_1.imageConfig).toEqual({
      project3dOverlays: false,
    });
  });

  it("round-trips image overlay config through the rendering plan", () => {
    const renderingPlan = {
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
          panelId: "image_panel_1",
          archetype: "image",
          title: "Image panel 1",
          renderStreamId: "/camera/front",
          visibleStreamIds: ["/semantic_map"],
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
          imageConfig: {
            project3dOverlays: true,
          },
        },
        {
          panelId: "panel_3d_1",
          archetype: "3d",
          title: "3D panel 1",
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
      ],
      layoutTree: {
        type: "split" as const,
        direction: "row" as const,
        splitPercentage: 50,
        first: { type: "leaf" as const, panelId: "image_panel_1" },
        second: { type: "leaf" as const, panelId: "panel_3d_1" },
      },
    };

    const workspaceState = createWorkspaceStateFromRenderingPlan(renderingPlan);
    const nextRenderingPlan =
      createRenderingPlanFromWorkspaceState(workspaceState);

    expect(
      nextRenderingPlan.panels.find(
        (panel) => panel.panelId === "image_panel_1"
      )?.imageConfig
    ).toEqual({
      project3dOverlays: true,
    });
    expect(
      nextRenderingPlan.panels.find((panel) => panel.panelId === "panel_3d_1")
        ?.imageConfig
    ).toBeUndefined();
  });

  it("retitles legacy generic panels from their bound stream prefixes", () => {
    const catalog = {
      streams: [
        {
          streamId: "/lidar/top",
          topic: "/lidar/top",
          schemaName: "sensor_msgs/msg/PointCloud2",
          kind: "3d",
          compatiblePanels: ["3d"],
        },
        {
          streamId: "/camera/front",
          topic: "/camera/front",
          schemaName: "foxglove.CompressedImage",
          kind: "image",
          compatiblePanels: ["image"],
        },
        {
          streamId: "/camera/left",
          topic: "/camera/left",
          schemaName: "foxglove.CompressedImage",
          kind: "image",
          compatiblePanels: ["image"],
        },
      ],
    } as any;

    const initialState = createWorkspaceStateFromRenderingPlan({
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
      ],
      layoutTree: {
        type: "split" as const,
        direction: "row" as const,
        splitPercentage: 50,
        first: { type: "leaf" as const, panelId: "panel_3d_1" },
        second: {
          type: "split" as const,
          direction: "column" as const,
          splitPercentage: 50,
          first: { type: "leaf" as const, panelId: "image_panel_1" },
          second: { type: "leaf" as const, panelId: "image_panel_2" },
        },
      },
    });

    expect(
      retitleGenericPanelsInWorkspaceState(initialState, catalog).panels
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ panelId: "panel_3d_1", title: "lidar" }),
        expect.objectContaining({ panelId: "image_panel_1", title: "camera" }),
        expect.objectContaining({
          panelId: "image_panel_2",
          title: "camera 2",
        }),
      ])
    );
  });

  it("auto-binds matching image annotation and calibration streams", () => {
    const catalog = {
      streams: [
        {
          streamId: "/CAM_FRONT/image_rect_compressed",
          topic: "/CAM_FRONT/image_rect_compressed",
          schemaName: "foxglove.CompressedImage",
          kind: "image",
          compatiblePanels: ["image"],
        },
        {
          streamId: "/CAM_FRONT/annotations",
          topic: "/CAM_FRONT/annotations",
          schemaName: "foxglove.ImageAnnotations",
          kind: "other",
          compatiblePanels: ["image"],
        },
        {
          streamId: "/CAM_FRONT/camera_info",
          topic: "/CAM_FRONT/camera_info",
          schemaName: "foxglove.CameraCalibration",
          kind: "other",
          compatiblePanels: ["image"],
        },
        {
          streamId: "/semantic_map",
          topic: "/semantic_map",
          schemaName: "foxglove.SceneUpdate",
          kind: "3d",
          compatiblePanels: ["3d", "image"],
        },
      ],
    } as any;

    expect(
      getDefaultImageSupportStreamIds(
        catalog,
        "/CAM_FRONT/image_rect_compressed"
      )
    ).toEqual(["/CAM_FRONT/annotations", "/CAM_FRONT/camera_info"]);
  });

  it("preserves manual SceneUpdate opt-ins when the image stream changes", () => {
    const catalog = {
      streams: [
        {
          streamId: "/CAM_FRONT/image_rect_compressed",
          topic: "/CAM_FRONT/image_rect_compressed",
          schemaName: "foxglove.CompressedImage",
          kind: "image",
          compatiblePanels: ["image"],
        },
        {
          streamId: "/CAM_FRONT/annotations",
          topic: "/CAM_FRONT/annotations",
          schemaName: "foxglove.ImageAnnotations",
          kind: "other",
          compatiblePanels: ["image"],
        },
        {
          streamId: "/CAM_FRONT/camera_info",
          topic: "/CAM_FRONT/camera_info",
          schemaName: "foxglove.CameraCalibration",
          kind: "other",
          compatiblePanels: ["image"],
        },
        {
          streamId: "/semantic_map",
          topic: "/semantic_map",
          schemaName: "foxglove.SceneUpdate",
          kind: "3d",
          compatiblePanels: ["3d", "image"],
        },
      ],
    } as any;

    expect(
      reconcileImageSupportStreamIds(
        catalog,
        "/CAM_FRONT/image_rect_compressed",
        ["/semantic_map"]
      )
    ).toEqual([
      "/CAM_FRONT/annotations",
      "/CAM_FRONT/camera_info",
      "/semantic_map",
    ]);
  });
});
