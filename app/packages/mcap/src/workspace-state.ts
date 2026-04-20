import type {
  MultimodalCatalog,
  MultimodalFrameConfig,
  MultimodalPanelArchetype,
  MultimodalPanelLayout,
  MultimodalPanelLayoutState,
  MultimodalRenderingPlan,
  MultimodalSceneConfig,
  MultimodalWorkspaceState,
} from "./types";

function createDefaultFrameConfig(): MultimodalFrameConfig {
  return {
    fixedFrameId: null,
    displayFrameId: null,
    followMode: "off",
    locationStreamId: null,
    enuFrameId: null,
  };
}

function createDefaultSceneConfig(): MultimodalSceneConfig {
  return {
    upAxis: "z",
    backgroundColor: "#10151d",
  };
}

function createDefaultPanelLayout(
  archetype: MultimodalPanelArchetype,
  index: number
): MultimodalPanelLayout {
  if (archetype === "3d" && index === 0) {
    return { x: 0, y: 0, w: 12, h: 2 };
  }

  const tileIndex = archetype === "3d" ? index + 3 : index;
  return {
    x: (tileIndex % 3) * 4,
    y: Math.floor(tileIndex / 3),
    w: 4,
    h: 1,
  };
}

function findNextImagePanelLayout(
  panels: MultimodalPanelLayoutState[]
): MultimodalPanelLayout {
  const occupiedSlots = new Set<string>();

  panels.forEach((panel) => {
    const startColumn = Math.max(0, Math.floor(panel.layout.x / 4));
    const columnSpan = Math.max(1, Math.ceil(panel.layout.w / 4));
    for (
      let row = panel.layout.y;
      row < panel.layout.y + panel.layout.h;
      row += 1
    ) {
      for (
        let column = startColumn;
        column < startColumn + columnSpan;
        column += 1
      ) {
        occupiedSlots.add(`${row}:${column}`);
      }
    }
  });

  const maxBottom = panels.reduce(
    (currentMax, panel) =>
      Math.max(currentMax, panel.layout.y + panel.layout.h),
    0
  );

  for (let row = 0; row <= maxBottom; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (!occupiedSlots.has(`${row}:${column}`)) {
        return {
          x: column * 4,
          y: row,
          w: 4,
          h: 1,
        };
      }
    }
  }

  return {
    x: 0,
    y: maxBottom,
    w: 4,
    h: 1,
  };
}

function getNextPanelLayout(
  panels: MultimodalPanelLayoutState[],
  archetype: MultimodalPanelArchetype
): MultimodalPanelLayout {
  if (!panels.length) {
    return createDefaultPanelLayout(archetype, 0);
  }

  const maxBottom = panels.reduce(
    (currentMax, panel) =>
      Math.max(currentMax, panel.layout.y + panel.layout.h),
    0
  );

  if (archetype === "3d") {
    return { x: 0, y: maxBottom, w: 12, h: 2 };
  }

  return findNextImagePanelLayout(panels);
}

export function createWorkspaceStateFromRenderingPlan(
  renderingPlan: MultimodalRenderingPlan
): MultimodalWorkspaceState {
  return {
    sceneId: renderingPlan.sceneId,
    sync: renderingPlan.sync,
    activePanelId: renderingPlan.panels[0]?.panelId ?? null,
    maximizedPanelId: null,
    sidebarCollapsed: false,
    panels: renderingPlan.panels.map((panel) => ({
      ...panel,
      visibleStreamIds: [...panel.visibleStreamIds],
      frameConfig: { ...panel.frameConfig },
      sceneConfig: { ...panel.sceneConfig },
      layout: { ...panel.layout },
    })),
  };
}

export function createUnboundPanel(
  _sceneId: string,
  archetype: MultimodalPanelArchetype,
  index: number
): MultimodalPanelLayoutState {
  return {
    panelId: `${archetype}_panel_${index}`,
    archetype,
    title: archetype === "image" ? "Image panel" : "3D panel",
    renderStreamId: null,
    visibleStreamIds: [],
    frameConfig: createDefaultFrameConfig(),
    sceneConfig: createDefaultSceneConfig(),
    layout: createDefaultPanelLayout(archetype, Math.max(index - 1, 0)),
  };
}

export function addPanelToWorkspaceState(
  state: MultimodalWorkspaceState,
  archetype: MultimodalPanelArchetype
): MultimodalWorkspaceState {
  const nextPanel = {
    ...createUnboundPanel(state.sceneId, archetype, state.panels.length + 1),
    layout: getNextPanelLayout(state.panels, archetype),
  };
  return {
    ...state,
    activePanelId: nextPanel.panelId,
    maximizedPanelId: state.maximizedPanelId ? nextPanel.panelId : null,
    panels: [...state.panels, nextPanel],
  };
}

export function selectPanelInWorkspaceState(
  state: MultimodalWorkspaceState,
  panelId: string
): MultimodalWorkspaceState {
  return {
    ...state,
    activePanelId: panelId,
  };
}

export function toggleSidebarInWorkspaceState(state: MultimodalWorkspaceState) {
  return {
    ...state,
    sidebarCollapsed: !state.sidebarCollapsed,
  };
}

export function togglePanelMaximizedInWorkspaceState(
  state: MultimodalWorkspaceState,
  panelId: string
): MultimodalWorkspaceState {
  return {
    ...state,
    activePanelId: panelId,
    maximizedPanelId: state.maximizedPanelId === panelId ? null : panelId,
  };
}

export function removePanelFromWorkspaceState(
  state: MultimodalWorkspaceState,
  panelId: string
): MultimodalWorkspaceState {
  const panelIndex = state.panels.findIndex(
    (panel) => panel.panelId === panelId
  );
  if (panelIndex < 0) {
    return state;
  }

  const nextPanels = state.panels.filter((panel) => panel.panelId !== panelId);
  const fallbackPanel =
    nextPanels[Math.min(panelIndex, nextPanels.length - 1)] ??
    nextPanels[0] ??
    null;

  return {
    ...state,
    activePanelId:
      state.activePanelId === panelId
        ? fallbackPanel?.panelId ?? null
        : state.activePanelId,
    maximizedPanelId:
      state.maximizedPanelId === panelId ? null : state.maximizedPanelId,
    panels: nextPanels,
  };
}

export function getActivePanel(
  state: MultimodalWorkspaceState | null
): MultimodalPanelLayoutState | null {
  if (!state) {
    return null;
  }

  return (
    state.panels.find((panel) => panel.panelId === state.activePanelId) ??
    state.panels[0] ??
    null
  );
}

export function updatePanelInWorkspaceState(
  state: MultimodalWorkspaceState,
  panelId: string,
  updater: (panel: MultimodalPanelLayoutState) => MultimodalPanelLayoutState
): MultimodalWorkspaceState {
  return {
    ...state,
    panels: state.panels.map((panel) =>
      panel.panelId === panelId ? updater(panel) : panel
    ),
  };
}

export function getCompatibleStreams(
  catalog: MultimodalCatalog,
  archetype: MultimodalPanelArchetype
) {
  return catalog.streams.filter((stream) =>
    stream.compatiblePanels.includes(archetype)
  );
}
