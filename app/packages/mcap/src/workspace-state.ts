import type {
  MultimodalCatalog,
  MultimodalFrameConfig,
  MultimodalImageConfig,
  MultimodalLayoutDirection,
  MultimodalLayoutNode,
  MultimodalPanelArchetype,
  MultimodalPanelLayoutState,
  MultimodalRenderingPlan,
  MultimodalSceneConfig,
  MultimodalWorkspaceState,
} from "./types";
import { isImageSupportStream } from "./panel-binding-registry";

const AUTO_IMAGE_SUPPORT_SCHEMA_NAMES = new Set([
  "foxglove.CameraCalibration",
  "foxglove.ImageAnnotations",
]);
const LEGACY_PANEL_TITLE_PATTERNS: Record<MultimodalPanelArchetype, RegExp[]> =
  {
    image: [/^image panel(?: \d+)?$/i, /^image(?: \d+)?$/i],
    "3d": [/^3d panel(?: \d+)?$/i, /^3d(?: \d+)?$/i],
  };

/** Default width in pixels for the multimodal sidebar. */
export const DEFAULT_MULTIMODAL_SIDEBAR_WIDTH_PX = 208;

/** Smallest supported width in pixels for the multimodal sidebar. */
export const MIN_MULTIMODAL_SIDEBAR_WIDTH_PX = 176;

/** Largest supported width in pixels for the multimodal sidebar. */
export const MAX_MULTIMODAL_SIDEBAR_WIDTH_PX = 420;

function getTopicPrefix(topic: string) {
  const lastSlashIndex = topic.lastIndexOf("/");
  return lastSlashIndex >= 0 ? topic.slice(0, lastSlashIndex) : topic;
}

function getFirstTopicSegment(topic: string | null | undefined) {
  if (!topic) {
    return null;
  }

  return (
    topic
      .split("/")
      .map((segment) => segment.trim())
      .find((segment) => segment.length > 0) ?? null
  );
}

function getFallbackPanelTitle(archetype: MultimodalPanelArchetype) {
  return archetype === "image" ? "image" : "3d";
}

function normalizeSidebarWidth(width: number | null | undefined) {
  if (!Number.isFinite(width)) {
    return DEFAULT_MULTIMODAL_SIDEBAR_WIDTH_PX;
  }

  return Math.max(
    MIN_MULTIMODAL_SIDEBAR_WIDTH_PX,
    Math.min(MAX_MULTIMODAL_SIDEBAR_WIDTH_PX, Math.round(width))
  );
}

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
    showGrid: true,
  };
}

function createDefaultImageConfig(): MultimodalImageConfig {
  return {
    project3dOverlays: false,
  };
}

function createPanelLookup(panels: MultimodalPanelLayoutState[]) {
  return Object.fromEntries(
    panels.map((panel) => [panel.panelId, panel])
  ) as Record<string, MultimodalPanelLayoutState>;
}

function getUniquePanelTitle(
  baseTitle: string,
  panels: MultimodalPanelLayoutState[],
  panelIdToIgnore?: string
) {
  const normalizedBaseTitle = baseTitle.trim() || "panel";
  const usedTitles = new Set(
    panels
      .filter((panel) => panel.panelId !== panelIdToIgnore)
      .map((panel) => panel.title)
  );

  if (!usedTitles.has(normalizedBaseTitle)) {
    return normalizedBaseTitle;
  }

  let suffix = 2;
  while (usedTitles.has(`${normalizedBaseTitle} ${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBaseTitle} ${suffix}`;
}

function getPanelTitleBase(
  catalog: MultimodalCatalog,
  panel: Pick<
    MultimodalPanelLayoutState,
    "archetype" | "renderStreamId" | "visibleStreamIds"
  >
) {
  if (panel.archetype === "image") {
    const imageTopic =
      catalog.streams.find((stream) => stream.streamId === panel.renderStreamId)
        ?.topic ?? panel.renderStreamId;

    return (
      getFirstTopicSegment(imageTopic) ?? getFallbackPanelTitle(panel.archetype)
    );
  }

  const primaryStreamId = panel.visibleStreamIds[0] ?? null;
  const primaryStreamTopic =
    catalog.streams.find((stream) => stream.streamId === primaryStreamId)
      ?.topic ?? primaryStreamId;

  return (
    getFirstTopicSegment(primaryStreamTopic) ??
    getFallbackPanelTitle(panel.archetype)
  );
}

function isLegacyPanelTitle(
  title: string,
  archetype: MultimodalPanelArchetype
) {
  const normalizedTitle = title.trim();
  return LEGACY_PANEL_TITLE_PATTERNS[archetype].some((pattern) =>
    pattern.test(normalizedTitle)
  );
}

function createLayoutLeaf(panelId: string): MultimodalLayoutNode {
  return { type: "leaf", panelId };
}

function createLayoutSplit(
  direction: MultimodalLayoutDirection,
  first: MultimodalLayoutNode,
  second: MultimodalLayoutNode,
  splitPercentage = 50
): MultimodalLayoutNode {
  return {
    type: "split",
    direction,
    splitPercentage,
    first,
    second,
  };
}

function cloneLayoutTree(
  layoutTree: MultimodalLayoutNode | null
): MultimodalLayoutNode | null {
  if (!layoutTree) {
    return null;
  }

  if (layoutTree.type === "leaf") {
    return { ...layoutTree };
  }

  return {
    ...layoutTree,
    first: cloneLayoutTree(layoutTree.first)!,
    second: cloneLayoutTree(layoutTree.second)!,
  };
}

function findFirstLayoutLeafId(layoutTree: MultimodalLayoutNode | null) {
  if (!layoutTree) {
    return null;
  }

  if (layoutTree.type === "leaf") {
    return layoutTree.panelId;
  }

  return (
    findFirstLayoutLeafId(layoutTree.first) ??
    findFirstLayoutLeafId(layoutTree.second)
  );
}

function getPanelSequenceInfo(
  panels: MultimodalPanelLayoutState[],
  archetype: MultimodalPanelArchetype
) {
  const prefix = archetype === "image" ? "image_panel_" : "panel_3d_";
  let maxIndex = 0;

  panels.forEach((panel) => {
    if (!panel.panelId.startsWith(prefix)) {
      return;
    }

    const suffix = Number(panel.panelId.slice(prefix.length));
    if (Number.isFinite(suffix) && suffix > maxIndex) {
      maxIndex = suffix;
    }
  });

  const nextIndex = maxIndex + 1;

  return {
    panelId: `${prefix}${nextIndex}`,
    title: getUniquePanelTitle(getFallbackPanelTitle(archetype), panels),
  };
}

function createUnboundPanel(
  panels: MultimodalPanelLayoutState[],
  archetype: MultimodalPanelArchetype
): MultimodalPanelLayoutState {
  const nextPanel = getPanelSequenceInfo(panels, archetype);

  return {
    panelId: nextPanel.panelId,
    archetype,
    title: nextPanel.title,
    renderStreamId: null,
    visibleStreamIds: [],
    frameConfig: createDefaultFrameConfig(),
    sceneConfig: createDefaultSceneConfig(),
    imageConfig: archetype === "image" ? createDefaultImageConfig() : undefined,
  };
}

function replaceLeafWithSplit(
  layoutTree: MultimodalLayoutNode,
  targetPanelId: string,
  direction: MultimodalLayoutDirection,
  nextPanelId: string
): MultimodalLayoutNode {
  if (layoutTree.type === "leaf") {
    if (layoutTree.panelId !== targetPanelId) {
      return layoutTree;
    }

    return createLayoutSplit(
      direction,
      createLayoutLeaf(targetPanelId),
      createLayoutLeaf(nextPanelId)
    );
  }

  return {
    ...layoutTree,
    first: replaceLeafWithSplit(
      layoutTree.first,
      targetPanelId,
      direction,
      nextPanelId
    ),
    second: replaceLeafWithSplit(
      layoutTree.second,
      targetPanelId,
      direction,
      nextPanelId
    ),
  };
}

function removeLeafFromLayoutTree(
  layoutTree: MultimodalLayoutNode | null,
  panelId: string
): MultimodalLayoutNode | null {
  if (!layoutTree) {
    return null;
  }

  if (layoutTree.type === "leaf") {
    return layoutTree.panelId === panelId ? null : layoutTree;
  }

  const nextFirst = removeLeafFromLayoutTree(layoutTree.first, panelId);
  const nextSecond = removeLeafFromLayoutTree(layoutTree.second, panelId);

  if (!nextFirst) {
    return nextSecond;
  }

  if (!nextSecond) {
    return nextFirst;
  }

  return {
    ...layoutTree,
    first: nextFirst,
    second: nextSecond,
  };
}

/**
 * Builds the default balanced workspace tree for a set of panel ids.
 */
export function createBalancedLayoutTree(
  panelIds: string[],
  depth = 0
): MultimodalLayoutNode | null {
  if (panelIds.length === 0) {
    return null;
  }

  if (depth === 0) {
    if (panelIds.length === 1) {
      return createLayoutLeaf(panelIds[0]);
    }

    if (panelIds.length === 2) {
      return createLayoutSplit(
        "row",
        createLayoutLeaf(panelIds[0]),
        createLayoutLeaf(panelIds[1])
      );
    }

    if (panelIds.length === 3) {
      return createLayoutSplit(
        "row",
        createLayoutLeaf(panelIds[0]),
        createLayoutSplit(
          "column",
          createLayoutLeaf(panelIds[1]),
          createLayoutLeaf(panelIds[2])
        ),
        33
      );
    }

    if (panelIds.length === 4) {
      return createLayoutSplit(
        "column",
        createLayoutSplit(
          "row",
          createLayoutLeaf(panelIds[0]),
          createLayoutLeaf(panelIds[1])
        ),
        createLayoutSplit(
          "row",
          createLayoutLeaf(panelIds[2]),
          createLayoutLeaf(panelIds[3])
        )
      );
    }
  }

  if (panelIds.length === 1) {
    return createLayoutLeaf(panelIds[0]);
  }

  const splitIndex = Math.floor(panelIds.length / 2);
  const direction = depth % 2 === 0 ? "row" : "column";
  const firstPanelIds = panelIds.slice(0, splitIndex);
  const secondPanelIds = panelIds.slice(splitIndex);

  return createLayoutSplit(
    direction,
    createBalancedLayoutTree(firstPanelIds, depth + 1)!,
    createBalancedLayoutTree(secondPanelIds, depth + 1)!,
    Math.round((firstPanelIds.length / panelIds.length) * 100)
  );
}

/**
 * Creates local workspace state from the persisted rendering plan.
 */
export function createWorkspaceStateFromRenderingPlan(
  renderingPlan: MultimodalRenderingPlan
): MultimodalWorkspaceState {
  const panels = renderingPlan.panels.map((panel) => ({
    ...panel,
    visibleStreamIds: [...panel.visibleStreamIds],
    frameConfig: { ...createDefaultFrameConfig(), ...panel.frameConfig },
    sceneConfig: { ...createDefaultSceneConfig(), ...panel.sceneConfig },
    imageConfig:
      panel.archetype === "image"
        ? { ...createDefaultImageConfig(), ...panel.imageConfig }
        : undefined,
  }));
  const layoutTree =
    cloneLayoutTree(renderingPlan.layoutTree) ??
    createBalancedLayoutTree(panels.map((panel) => panel.panelId));

  return {
    sceneId: renderingPlan.sceneId,
    mediaField: renderingPlan.mediaField,
    sourceKind: renderingPlan.sourceKind,
    sync: renderingPlan.sync,
    activePanelId:
      findFirstLayoutLeafId(layoutTree) ?? panels[0]?.panelId ?? null,
    maximizedPanelId: null,
    sidebarCollapsed: false,
    sidebarWidth: normalizeSidebarWidth(renderingPlan.sidebarWidth),
    layoutTree,
    panels,
    panelsById: createPanelLookup(panels),
  };
}

/**
 * Converts the local workspace state back into the persisted rendering-plan shape.
 */
export function createRenderingPlanFromWorkspaceState(
  state: MultimodalWorkspaceState
): MultimodalRenderingPlan {
  return {
    sceneId: state.sceneId,
    mediaField: state.mediaField,
    sourceKind: state.sourceKind,
    sync: state.sync,
    panels: state.panels.map((panel) => ({
      ...panel,
      visibleStreamIds: [...panel.visibleStreamIds],
      frameConfig: { ...panel.frameConfig },
      sceneConfig: { ...panel.sceneConfig },
      imageConfig:
        panel.archetype === "image"
          ? { ...createDefaultImageConfig(), ...panel.imageConfig }
          : undefined,
    })),
    sidebarWidth: normalizeSidebarWidth(state.sidebarWidth),
    layoutTree: cloneLayoutTree(state.layoutTree),
  };
}

/**
 * Adds a new panel by splitting the active leaf on the requested axis.
 */
export function addPanelToWorkspaceState(
  state: MultimodalWorkspaceState,
  archetype: MultimodalPanelArchetype,
  options?: {
    direction?: MultimodalLayoutDirection;
    targetPanelId?: string | null;
  }
): MultimodalWorkspaceState {
  const nextPanel = createUnboundPanel(state.panels, archetype);
  const nextPanels = [...state.panels, nextPanel];
  const targetPanelId =
    options?.targetPanelId ??
    state.activePanelId ??
    findFirstLayoutLeafId(state.layoutTree);
  let nextLayoutTree = cloneLayoutTree(state.layoutTree);

  if (!nextLayoutTree || !targetPanelId) {
    nextLayoutTree = createLayoutLeaf(nextPanel.panelId);
  } else {
    nextLayoutTree = replaceLeafWithSplit(
      nextLayoutTree,
      targetPanelId,
      options?.direction ?? "row",
      nextPanel.panelId
    );
  }

  return {
    ...state,
    activePanelId: nextPanel.panelId,
    maximizedPanelId: state.maximizedPanelId ? nextPanel.panelId : null,
    layoutTree: nextLayoutTree,
    panels: nextPanels,
    panelsById: createPanelLookup(nextPanels),
  };
}

/**
 * Selects the active panel in local workspace state.
 */
export function selectPanelInWorkspaceState(
  state: MultimodalWorkspaceState,
  panelId: string
): MultimodalWorkspaceState {
  return {
    ...state,
    activePanelId: panelId,
  };
}

/**
 * Replaces the local layout tree after a Mosaic resize or rearrangement.
 */
export function setLayoutTreeInWorkspaceState(
  state: MultimodalWorkspaceState,
  layoutTree: MultimodalLayoutNode | null
): MultimodalWorkspaceState {
  return {
    ...state,
    layoutTree: cloneLayoutTree(layoutTree),
    activePanelId:
      state.activePanelId ??
      findFirstLayoutLeafId(layoutTree) ??
      state.panels[0]?.panelId ??
      null,
  };
}

/**
 * Toggles the compact sidebar visibility.
 */
export function toggleSidebarInWorkspaceState(state: MultimodalWorkspaceState) {
  return {
    ...state,
    sidebarCollapsed: !state.sidebarCollapsed,
  };
}

/**
 * Sets the sidebar width while clamping it to the supported pixel range.
 */
export function setSidebarWidthInWorkspaceState(
  state: MultimodalWorkspaceState,
  sidebarWidth: number
): MultimodalWorkspaceState {
  return {
    ...state,
    sidebarWidth: normalizeSidebarWidth(sidebarWidth),
  };
}

/**
 * Toggles single-panel maximize mode.
 */
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

/**
 * Removes a panel and collapses the layout tree around the removed leaf.
 */
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
  const nextLayoutTree = removeLeafFromLayoutTree(state.layoutTree, panelId);
  const fallbackPanelId =
    findFirstLayoutLeafId(nextLayoutTree) ??
    nextPanels[Math.min(panelIndex, nextPanels.length - 1)]?.panelId ??
    nextPanels[0]?.panelId ??
    null;

  return {
    ...state,
    activePanelId:
      state.activePanelId === panelId ? fallbackPanelId : state.activePanelId,
    maximizedPanelId:
      state.maximizedPanelId === panelId ? null : state.maximizedPanelId,
    layoutTree: nextLayoutTree,
    panels: nextPanels,
    panelsById: createPanelLookup(nextPanels),
  };
}

/**
 * Returns the active panel for the current workspace state.
 */
export function getActivePanel(
  state: MultimodalWorkspaceState | null
): MultimodalPanelLayoutState | null {
  if (!state) {
    return null;
  }

  return state.panelsById[state.activePanelId ?? ""] ?? state.panels[0] ?? null;
}

/**
 * Applies a panel update while keeping the lookup map in sync.
 */
export function updatePanelInWorkspaceState(
  state: MultimodalWorkspaceState,
  panelId: string,
  updater: (panel: MultimodalPanelLayoutState) => MultimodalPanelLayoutState
): MultimodalWorkspaceState {
  const nextPanels = state.panels.map((panel) =>
    panel.panelId === panelId ? updater(panel) : panel
  );

  return {
    ...state,
    panels: nextPanels,
    panelsById: createPanelLookup(nextPanels),
  };
}

export function getSuggestedPanelTitle(
  catalog: MultimodalCatalog,
  panel: Pick<
    MultimodalPanelLayoutState,
    "panelId" | "archetype" | "renderStreamId" | "visibleStreamIds" | "title"
  >,
  panels: MultimodalPanelLayoutState[]
) {
  return getUniquePanelTitle(
    getPanelTitleBase(catalog, panel),
    panels,
    panel.panelId
  );
}

export function shouldSyncPanelTitleToStreams(
  title: string,
  archetype: MultimodalPanelArchetype,
  currentAutoTitle: string
) {
  const normalizedTitle = title.trim();
  return (
    isLegacyPanelTitle(normalizedTitle, archetype) ||
    normalizedTitle === currentAutoTitle
  );
}

export function retitleGenericPanelsInWorkspaceState(
  state: MultimodalWorkspaceState,
  catalog: MultimodalCatalog
) {
  let didChange = false;
  const nextPanels: MultimodalPanelLayoutState[] = [];

  state.panels.forEach((panel, index) => {
    if (!isLegacyPanelTitle(panel.title, panel.archetype)) {
      nextPanels.push(panel);
      return;
    }

    const nextTitle = getSuggestedPanelTitle(catalog, panel, [
      ...nextPanels,
      ...state.panels.slice(index + 1),
    ]);

    if (nextTitle === panel.title) {
      nextPanels.push(panel);
      return;
    }

    didChange = true;
    nextPanels.push({
      ...panel,
      title: nextTitle,
    });
  });

  if (!didChange) {
    return state;
  }

  return {
    ...state,
    panels: nextPanels,
    panelsById: createPanelLookup(nextPanels),
  };
}

export function getDefaultImageSupportStreamIds(
  catalog: MultimodalCatalog,
  imageStreamId: string | null
) {
  if (!imageStreamId) {
    return [];
  }

  const imageStream =
    catalog.streams.find((stream) => stream.streamId === imageStreamId) ?? null;
  if (!imageStream) {
    return [];
  }

  const imageTopicPrefix = getTopicPrefix(imageStream.topic);

  return catalog.streams
    .filter((stream) => {
      if (stream.streamId === imageStream.streamId) {
        return false;
      }

      if (
        !isImageSupportStream(stream) ||
        !AUTO_IMAGE_SUPPORT_SCHEMA_NAMES.has(stream.schemaName)
      ) {
        return false;
      }

      return (
        stream.topic.startsWith(`${imageStream.topic}/`) ||
        getTopicPrefix(stream.topic) === imageTopicPrefix
      );
    })
    .map((stream) => stream.streamId);
}

export function reconcileImageSupportStreamIds(
  catalog: MultimodalCatalog,
  imageStreamId: string | null,
  currentSupportStreamIds: string[]
) {
  const autoBoundSupportStreamIds = getDefaultImageSupportStreamIds(
    catalog,
    imageStreamId
  );
  const preservedSceneUpdateStreamIds = currentSupportStreamIds.filter(
    (streamId) =>
      catalog.streams.find((stream) => stream.streamId === streamId)
        ?.schemaName === "foxglove.SceneUpdate"
  );

  return Array.from(
    new Set([...autoBoundSupportStreamIds, ...preservedSceneUpdateStreamIds])
  );
}

/**
 * Returns catalog streams that can bind to the requested panel archetype.
 */
export function getCompatibleStreams(
  catalog: MultimodalCatalog,
  archetype: MultimodalPanelArchetype
) {
  return catalog.streams.filter((stream) =>
    stream.compatiblePanels.includes(archetype)
  );
}
