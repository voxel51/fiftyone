import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import type { SampleRendererProps } from "@fiftyone/plugins";
import { DurationTimelineControls } from "@fiftyone/playback/experimental/views/DurationTimelineControls";
import {
  Align,
  BackgroundColor,
  Button,
  Card,
  CardBackground,
  Heading,
  HeadingLevel,
  IconName,
  Input,
  InputType,
  Justify,
  Orientation,
  Pill,
  Size,
  Spinner,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import {
  Mosaic,
  MosaicWindow,
  type MosaicBranch,
  type MosaicNode,
} from "react-mosaic-component";
import "react-mosaic-component/react-mosaic-component.css";
import { Image2dView, Points3dView } from "./archetypes";
import "./multimodal-mosaic.css";
import {
  canBindStreamToPanel,
  isImageRenderableStream,
  isImageSupportStream,
} from "./panel-binding-registry";
import { getStreamById } from "./scene-view-model";
import {
  getMultimodalRendererInfo,
  getMultimodalSceneParams,
} from "./renderer-utils";
import { getRelevantTransforms } from "./transform-runtime";
import type {
  MultimodalCatalog,
  MultimodalFrameConfig,
  MultimodalLayoutNode,
  MultimodalPanelArchetype,
  MultimodalPanelLayoutState,
  MultimodalSceneConfig,
  MultimodalStreamDescriptor,
  MultimodalWorkspaceState,
} from "./types";
import {
  useMultimodalPlaybackController,
  type MultimodalPlaybackPanelState,
} from "./useMultimodalPlaybackController";
import type { MultimodalExperimentalTimelineState } from "./useMultimodalExperimentalTimeline";
import { useMultimodalWorkspace } from "./useMultimodalWorkspace";
import {
  addPanelToWorkspaceState,
  DEFAULT_MULTIMODAL_SIDEBAR_WIDTH_PX,
  MAX_MULTIMODAL_SIDEBAR_WIDTH_PX,
  MIN_MULTIMODAL_SIDEBAR_WIDTH_PX,
  createRenderingPlanFromWorkspaceState,
  createWorkspaceStateFromRenderingPlan,
  getActivePanel,
  getDefaultImageSupportStreamIds,
  getSuggestedPanelTitle,
  removePanelFromWorkspaceState,
  reconcileImageSupportStreamIds,
  retitleGenericPanelsInWorkspaceState,
  selectPanelInWorkspaceState,
  setLayoutTreeInWorkspaceState,
  setSidebarWidthInWorkspaceState,
  shouldSyncPanelTitleToStreams,
  togglePanelMaximizedInWorkspaceState,
  toggleSidebarInWorkspaceState,
  updatePanelInWorkspaceState,
} from "./workspace-state";

const ROOT_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: `${DEFAULT_MULTIMODAL_SIDEBAR_WIDTH_PX}px minmax(0, 1fr)`,
  background:
    "radial-gradient(circle at top left, rgba(33, 52, 74, 0.48), transparent 38%), linear-gradient(180deg, #09111a 0%, #101924 100%)",
};

const SIDEBAR_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  background: "rgba(6, 11, 18, 0.92)",
  padding: "8px",
  overflow: "auto",
};

const SIDEBAR_RESIZER_WIDTH_PX = 8;
const MIN_MAIN_WIDTH_PX = 320;

const SIDEBAR_RESIZER_STYLES: React.CSSProperties = {
  position: "relative",
  minWidth: `${SIDEBAR_RESIZER_WIDTH_PX}px`,
  cursor: "col-resize",
  background: "rgba(255,255,255,0.04)",
};

const SIDEBAR_RESIZER_GRIP_STYLES: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  width: "2px",
  height: "40px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.28)",
  transform: "translate(-50%, -50%)",
};

const MAIN_STYLES: React.CSSProperties = {
  position: "relative",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  paddingBottom: "72px",
};

const TOOLBAR_STYLES: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(9, 15, 24, 0.72)",
};

const MOSAIC_CONTAINER_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  padding: "4px",
};

const TIMELINE_DOCK_STYLES: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  padding: "10px 12px",
  borderTop: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(8, 13, 20, 0.9)",
  backdropFilter: "blur(10px)",
};

const SECTION_CARD_STYLES: React.CSSProperties = {
  padding: 0,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
};

const SECTION_HEADER_BUTTON_STYLES: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  padding: "8px 10px",
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

const SECTION_CONTENT_STYLES: React.CSSProperties = {
  padding: "0 10px 10px",
};

const SECTION_CARET_STYLES: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "18px",
  height: "18px",
  color: "rgba(255,255,255,0.52)",
  fontSize: "12px",
  fontWeight: 700,
  transition: "transform 120ms ease",
};

const PANEL_VIEWPORT_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  height: "100%",
  borderRadius: 0,
  overflow: "hidden",
  background: "rgba(255,255,255,0.03)",
};

type SidebarSectionId =
  | "panelTitle"
  | "frameConfig"
  | "sceneConfig"
  | "transforms"
  | "streams";

const DEFAULT_SIDEBAR_SECTION_STATE: Record<SidebarSectionId, boolean> = {
  panelTitle: false,
  frameConfig: true,
  sceneConfig: true,
  transforms: true,
  streams: true,
};

type PersistenceMode = "none" | "debounced" | "immediate";

function formatPlaybackTimestampNs(timestampNs: number) {
  const totalMilliseconds = Math.max(0, Math.round(timestampNs / 1_000_000));
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(
    milliseconds
  ).padStart(3, "0")}`;
}

function matchesSearch(
  query: string,
  values: Array<string | null | undefined>
) {
  if (!query) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

function arraysEqual<T>(left: T[], right: T[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function frameConfigEqual(
  left: MultimodalFrameConfig,
  right: MultimodalFrameConfig
) {
  return (
    left.fixedFrameId === right.fixedFrameId &&
    left.displayFrameId === right.displayFrameId &&
    left.followMode === right.followMode &&
    left.locationStreamId === right.locationStreamId &&
    left.enuFrameId === right.enuFrameId
  );
}

function sceneConfigEqual(
  left: MultimodalSceneConfig,
  right: MultimodalSceneConfig
) {
  return (
    left.upAxis === right.upAxis &&
    left.backgroundColor === right.backgroundColor &&
    (left.showGrid ?? true) === (right.showGrid ?? true)
  );
}

function isImage3dOverlayProjectionEnabled(panel: MultimodalPanelLayoutState) {
  return panel.archetype === "image"
    ? panel.imageConfig?.project3dOverlays ?? false
    : false;
}

function shouldIncludeImageSupportFrameForPanel(
  panel: MultimodalPanelLayoutState,
  stream: MultimodalStreamDescriptor | null | undefined
) {
  if (!stream || panel.archetype !== "image" || !isImageSupportStream(stream)) {
    return false;
  }

  if (
    stream.schemaName === "foxglove.CameraCalibration" ||
    canBindStreamToPanel(stream, "3d")
  ) {
    return isImage3dOverlayProjectionEnabled(panel);
  }

  return true;
}

function toMosaicNode(
  layoutTree: MultimodalLayoutNode | null
): MosaicNode<string> | null {
  if (!layoutTree) {
    return null;
  }

  if (layoutTree.type === "leaf") {
    return layoutTree.panelId;
  }

  return {
    direction: layoutTree.direction,
    splitPercentage: layoutTree.splitPercentage,
    first: toMosaicNode(layoutTree.first)!,
    second: toMosaicNode(layoutTree.second)!,
  };
}

function fromMosaicNode(
  mosaicNode: MosaicNode<string> | null
): MultimodalLayoutNode | null {
  if (!mosaicNode) {
    return null;
  }

  if (typeof mosaicNode === "string" || typeof mosaicNode === "number") {
    return {
      type: "leaf",
      panelId: String(mosaicNode),
    };
  }

  return {
    type: "split",
    direction: mosaicNode.direction,
    splitPercentage: mosaicNode.splitPercentage ?? 50,
    first: fromMosaicNode(mosaicNode.first)!,
    second: fromMosaicNode(mosaicNode.second)!,
  };
}

function getPanelStreamLabel(
  catalog: MultimodalCatalog,
  panel: MultimodalPanelLayoutState
) {
  if (panel.archetype === "image") {
    return getStreamById(catalog, panel.renderStreamId)?.topic ?? "Unbound";
  }

  if (panel.visibleStreamIds.length === 0) {
    return "Unbound";
  }

  if (panel.visibleStreamIds.length === 1) {
    return (
      getStreamById(catalog, panel.visibleStreamIds[0])?.topic ?? "1 stream"
    );
  }

  return `${panel.visibleStreamIds.length} streams`;
}

function SelectField({
  disabled = false,
  label,
  options,
  value,
  onChange,
}: {
  disabled?: boolean;
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
        {label}
      </Text>
      <select
        disabled={disabled}
        style={{
          width: "100%",
          borderRadius: "6px",
          padding: "6px 8px",
          background: "rgba(12, 18, 29, 0.9)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Stack>
  );
}

function SidebarSection({
  collapsed,
  forceExpanded = false,
  onToggle,
  title,
  children,
}: React.PropsWithChildren<{
  collapsed: boolean;
  forceExpanded?: boolean;
  onToggle: () => void;
  title: string;
}>) {
  const expanded = forceExpanded || !collapsed;

  return (
    <Card
      background={CardBackground.Secondary}
      outlined
      style={SECTION_CARD_STYLES}
    >
      <button
        aria-expanded={expanded}
        onClick={onToggle}
        style={SECTION_HEADER_BUTTON_STYLES}
        type="button"
      >
        <Text variant={TextVariant.Sm} color={TextColor.Primary}>
          {title}
        </Text>
        <span
          aria-hidden="true"
          style={{
            ...SECTION_CARET_STYLES,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          {">"}
        </span>
      </button>
      {expanded ? (
        <div style={SECTION_CONTENT_STYLES}>
          <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
            {children}
          </Stack>
        </div>
      ) : null}
    </Card>
  );
}

function StreamRow({
  activePanel,
  checked,
  controlType = "checkbox",
  disabled,
  groupName,
  onToggle,
  stream,
}: {
  activePanel: MultimodalPanelLayoutState;
  checked: boolean;
  controlType?: "checkbox" | "radio";
  disabled: boolean;
  groupName?: string;
  onToggle: () => void;
  stream: MultimodalStreamDescriptor;
}) {
  return (
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.Sm}
      justify={Justify.Between}
      align={Align.Center}
      style={{
        padding: "8px 0",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.Xs}
        style={{ minWidth: 0 }}
      >
        <Text variant={TextVariant.Sm} color={TextColor.Primary}>
          {stream.topic}
        </Text>
        <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
          {stream.schemaName}
        </Text>
        <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
          {stream.affordances.slice(0, 2).map((affordance) => (
            <Pill
              key={affordance}
              size={Size.Xs}
              backgroundColor={BackgroundColor.Secondary}
              color={TextColor.Primary}
            >
              {affordance}
            </Pill>
          ))}
        </Stack>
      </Stack>
      <input
        aria-label={`${activePanel.title}-${stream.topic}-toggle`}
        checked={checked}
        disabled={disabled}
        name={groupName}
        onChange={onToggle}
        type={controlType}
      />
    </Stack>
  );
}

function MultimodalTimelineDock({
  timelineState,
  timestampSource,
}: {
  timelineState: MultimodalExperimentalTimelineState;
  timestampSource: string | null;
}) {
  return (
    <DurationTimelineControls
      currentTime={timelineState.currentTimeNs}
      duration={timelineState.durationNs}
      canControlPlayback={timelineState.canControlPlayback}
      formatTime={formatPlaybackTimestampNs}
      loaded={timelineState.loaded}
      loading={timelineState.loading}
      onSeekEnd={() => {
        timelineState.notifySeekEnd();
      }}
      onSeekPercentage={(percentage) => {
        void timelineState.seekToPercentage(percentage);
      }}
      onSeekStart={() => {
        timelineState.pause();
        timelineState.notifySeekStart();
      }}
      onSpeedChange={(value) => {
        timelineState.setSpeed(value);
      }}
      onTogglePlay={() => {
        timelineState.togglePlay();
      }}
      playState={timelineState.playState}
      speed={timelineState.speed}
      subtitle={`${
        timestampSource ?? "log_time"
      } clock aligned across visible panels`}
      title=""
    />
  );
}

function PanelViewportInner({
  catalog,
  isTimelineLoading,
  panel,
  panelState,
}: {
  catalog: MultimodalCatalog;
  isTimelineLoading: boolean;
  panel: MultimodalPanelLayoutState;
  panelState: MultimodalPlaybackPanelState | undefined;
}) {
  const hasFrame =
    panel.archetype === "image"
      ? Boolean(panelState?.imageFrame)
      : Boolean(panelState?.sceneFrame);

  if (
    !panelState ||
    ((panelState.status === "idle" || panelState.status === "loading") &&
      !hasFrame)
  ) {
    const title = isTimelineLoading
      ? "Loading synchronized timeline"
      : panelState?.status === "loading"
      ? "Buffering panel data"
      : "Preparing first frame";
    const detail = isTimelineLoading
      ? "Aligning stream timestamps for synchronized playback"
      : panelState?.statusDetail ??
        (panel.archetype === "image"
          ? "Waiting for buffered image data"
          : "Waiting for buffered 3D data");

    return (
      <Stack
        data-testid="multimodal-panel-loading"
        orientation={Orientation.Column}
        spacing={Spacing.Sm}
        justify={Justify.Center}
        align={Align.Center}
        style={{ ...PANEL_VIEWPORT_STYLES, padding: "16px" }}
      >
        <Spinner size={Size.Sm} />
        <Text variant={TextVariant.Sm} color={TextColor.Primary}>
          {title}
        </Text>
        <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
          {detail}
        </Text>
      </Stack>
    );
  }

  if (panelState.status === "error") {
    return (
      <Stack
        data-testid="multimodal-panel-error"
        orientation={Orientation.Column}
        spacing={Spacing.Sm}
        justify={Justify.Center}
        style={{ ...PANEL_VIEWPORT_STYLES, padding: "16px" }}
      >
        <Text variant={TextVariant.Sm} color={TextColor.Primary}>
          Panel unavailable
        </Text>
        <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
          {panelState.error?.message ?? "Unknown error"}
        </Text>
      </Stack>
    );
  }

  if (panelState.status === "empty") {
    return (
      <Stack
        data-testid="multimodal-panel-empty"
        orientation={Orientation.Column}
        spacing={Spacing.Sm}
        justify={Justify.Center}
        align={Align.Center}
        style={{ ...PANEL_VIEWPORT_STYLES, padding: "16px" }}
      >
        <Text variant={TextVariant.Sm} color={TextColor.Primary}>
          {panel.archetype === "image"
            ? "Bind an image stream"
            : "Toggle 3D streams on"}
        </Text>
        <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
          {panelState.warnings[0] ?? "No compatible data at the current frame"}
        </Text>
      </Stack>
    );
  }

  if (panel.archetype === "image") {
    return (
      <div style={PANEL_VIEWPORT_STYLES}>
        <Image2dView
          alt={panel.title}
          frame={panelState.imageFrame}
          objectFit="contain"
        />
      </div>
    );
  }

  return (
    <div style={PANEL_VIEWPORT_STYLES}>
      <Points3dView
        backgroundColor={panel.sceneConfig.backgroundColor}
        colorMode={panelState.colorMode}
        followPose={panelState.followPose}
        frame={panelState.sceneFrame}
        preserveViewOnFrameChange
        resetViewToken={`${catalog.sceneId}:${panel.panelId}`}
        showGrid={panel.sceneConfig.showGrid ?? true}
        solidColor="#6ac7ff"
        upAxis={panel.sceneConfig.upAxis}
      />
    </div>
  );
}

const PanelViewport = React.memo(
  PanelViewportInner,
  (previousProps, nextProps) => {
    return (
      previousProps.catalog.sceneId === nextProps.catalog.sceneId &&
      previousProps.panel.panelId === nextProps.panel.panelId &&
      previousProps.panel.archetype === nextProps.panel.archetype &&
      previousProps.panel.renderStreamId === nextProps.panel.renderStreamId &&
      arraysEqual(
        previousProps.panel.visibleStreamIds,
        nextProps.panel.visibleStreamIds
      ) &&
      frameConfigEqual(
        previousProps.panel.frameConfig,
        nextProps.panel.frameConfig
      ) &&
      sceneConfigEqual(
        previousProps.panel.sceneConfig,
        nextProps.panel.sceneConfig
      ) &&
      previousProps.isTimelineLoading === nextProps.isTimelineLoading &&
      previousProps.panelState === nextProps.panelState
    );
  }
);

PanelViewport.displayName = "PanelViewport";

function renderPanelToolbar({
  active,
  isMaximized,
  panel,
  panelState,
  streamLabel,
  onClosePanel,
  onToggleMaximize,
}: {
  active: boolean;
  isMaximized: boolean;
  panel: MultimodalPanelLayoutState;
  panelState: MultimodalPlaybackPanelState | undefined;
  streamLabel: string;
  onClosePanel: () => void;
  onToggleMaximize: () => void;
}) {
  return (
    <div className="mcap-panel-toolbar">
      <div className="mcap-panel-toolbar-left">
        <div className="mcap-panel-toolbar-copy">
          <div
            className="mcap-panel-toolbar-title"
            title={panel.title}
            data-active={active ? "true" : "false"}
          >
            {panel.title}
          </div>
          <div className="mcap-panel-toolbar-stream" title={streamLabel}>
            {streamLabel}
          </div>
        </div>
      </div>
      <div className="mcap-panel-toolbar-right">
        <span className="mcap-panel-archetype-badge">
          {panel.archetype === "image" ? "2D" : "3D"}
        </span>
        {panelState && panelState.status !== "ready" ? (
          <span className="mcap-panel-status-chip">{panelState.status}</span>
        ) : null}
        <button
          aria-label={
            isMaximized ? "Restore panel" : `Maximize panel ${panel.title}`
          }
          className="mcap-panel-toolbar-button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMaximize();
          }}
          type="button"
        >
          {isMaximized ? "Restore" : "Max"}
        </button>
        <button
          aria-label={`Close panel ${panel.title}`}
          className="mcap-panel-toolbar-button"
          onClick={(event) => {
            event.stopPropagation();
            onClosePanel();
          }}
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * Expert-first multimodal modal renderer with Mosaic tiling and persisted layout.
 */
export function MultimodalModalRenderer({ ctx }: SampleRendererProps) {
  const info = getMultimodalRendererInfo(ctx);
  const params = React.useMemo(() => getMultimodalSceneParams(ctx), [ctx]);
  const {
    catalog,
    renderingPlan,
    isLoading,
    isSaving,
    error,
    saveError,
    refetch,
    save,
    clearSaveError,
  } = useMultimodalWorkspace(params);
  const renderingPlanKey = React.useMemo(() => {
    if (!renderingPlan) {
      return null;
    }

    return `${renderingPlan.sceneId}:${renderingPlan.mediaField}`;
  }, [renderingPlan?.mediaField, renderingPlan?.sceneId]);
  const [workspaceState, setWorkspaceState] =
    React.useState<MultimodalWorkspaceState | null>(() =>
      renderingPlan
        ? createWorkspaceStateFromRenderingPlan(renderingPlan)
        : null
    );
  const workspaceStateRef = React.useRef<MultimodalWorkspaceState | null>(
    workspaceState
  );
  const [collapsedSections, setCollapsedSections] = React.useState<
    Record<SidebarSectionId, boolean>
  >(() => DEFAULT_SIDEBAR_SECTION_STATE);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const panelElementRefs = React.useRef(new Map<string, HTMLDivElement>());
  const workspaceShellRef = React.useRef<HTMLDivElement | null>(null);
  const sidebarResizeRef = React.useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);
  const saveTimeoutRef = React.useRef<number | null>(null);
  const hasSearchQuery = deferredSearchQuery.trim().length > 0;

  React.useEffect(() => {
    workspaceStateRef.current = workspaceState;
  }, [workspaceState]);

  React.useEffect(() => {
    if (!renderingPlan) {
      workspaceStateRef.current = null;
      setWorkspaceState(null);
      return;
    }

    setWorkspaceState((current) => {
      if (
        current?.sceneId === renderingPlan.sceneId &&
        current?.mediaField === renderingPlan.mediaField
      ) {
        workspaceStateRef.current = current;
        return current;
      }

      const nextState = createWorkspaceStateFromRenderingPlan(renderingPlan);
      workspaceStateRef.current = nextState;
      return nextState;
    });
  }, [renderingPlan, renderingPlanKey]);

  React.useEffect(() => {
    if (!catalog) {
      return;
    }

    setWorkspaceState((current) => {
      if (!current) {
        return current;
      }

      const nextState = retitleGenericPanelsInWorkspaceState(current, catalog);
      workspaceStateRef.current = nextState;
      return nextState;
    });
  }, [catalog, renderingPlanKey]);

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const persistWorkspaceState = React.useCallback(
    async (nextState: MultimodalWorkspaceState) => {
      await save(createRenderingPlanFromWorkspaceState(nextState));
    },
    [save]
  );

  const scheduleSave = React.useCallback(
    (nextState: MultimodalWorkspaceState, delayMs = 220) => {
      clearSaveError();
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = window.setTimeout(() => {
        saveTimeoutRef.current = null;
        void persistWorkspaceState(nextState);
      }, delayMs);
    },
    [clearSaveError, persistWorkspaceState]
  );

  const applyWorkspaceState = React.useCallback(
    (
      updater: (current: MultimodalWorkspaceState) => MultimodalWorkspaceState,
      persistenceMode: PersistenceMode
    ) => {
      const current = workspaceStateRef.current;
      if (!current) {
        return;
      }

      const nextState = updater(current);
      workspaceStateRef.current = nextState;
      setWorkspaceState(nextState);

      if (persistenceMode === "debounced") {
        scheduleSave(nextState);
      }

      if (persistenceMode === "immediate") {
        clearSaveError();
        if (saveTimeoutRef.current !== null) {
          window.clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }

        void persistWorkspaceState(nextState);
      }
    },
    [clearSaveError, persistWorkspaceState, scheduleSave]
  );

  const clampSidebarWidth = React.useCallback((width: number) => {
    const shellWidth = workspaceShellRef.current?.clientWidth ?? 0;
    const maxWidthFromShell =
      shellWidth > 0
        ? Math.max(
            MIN_MULTIMODAL_SIDEBAR_WIDTH_PX,
            shellWidth - MIN_MAIN_WIDTH_PX - SIDEBAR_RESIZER_WIDTH_PX
          )
        : MAX_MULTIMODAL_SIDEBAR_WIDTH_PX;

    return Math.max(
      MIN_MULTIMODAL_SIDEBAR_WIDTH_PX,
      Math.min(
        Math.min(MAX_MULTIMODAL_SIDEBAR_WIDTH_PX, maxWidthFromShell),
        Math.round(width)
      )
    );
  }, []);

  const commitSidebarWidth = React.useCallback(() => {
    const currentWidth = workspaceStateRef.current?.sidebarWidth;
    if (currentWidth == null) {
      return;
    }

    applyWorkspaceState(
      (current) =>
        setSidebarWidthInWorkspaceState(
          current,
          clampSidebarWidth(currentWidth)
        ),
      "immediate"
    );
  }, [applyWorkspaceState, clampSidebarWidth]);

  const startSidebarResize = React.useCallback((clientX: number) => {
    const currentState = workspaceStateRef.current;
    if (!currentState || currentState.sidebarCollapsed) {
      return;
    }

    sidebarResizeRef.current = {
      startX: clientX,
      startWidth: currentState.sidebarWidth,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const updateSidebarResize = React.useCallback(
    (clientX: number) => {
      const resizeState = sidebarResizeRef.current;
      if (!resizeState) {
        return;
      }

      const nextWidth = clampSidebarWidth(
        resizeState.startWidth + clientX - resizeState.startX
      );

      applyWorkspaceState(
        (current) => setSidebarWidthInWorkspaceState(current, nextWidth),
        "none"
      );
    },
    [applyWorkspaceState, clampSidebarWidth]
  );

  const finishSidebarResize = React.useCallback(() => {
    if (!sidebarResizeRef.current) {
      return;
    }

    sidebarResizeRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    commitSidebarWidth();
  }, [commitSidebarWidth]);

  React.useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      updateSidebarResize(event.clientX);
    }

    function handlePointerUp() {
      finishSidebarResize();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [finishSidebarResize, updateSidebarResize]);

  const activePanel = React.useMemo(() => {
    return getActivePanel(workspaceState);
  }, [workspaceState]);
  const playback = useMultimodalPlaybackController(catalog, workspaceState);
  const { stepBackward, stepForward, togglePlay } = playback.timelineState;

  useKeyBindings(
    KnownContexts.Modal,
    [
      {
        commandId: "fo.modal.multimodal.playback.toggle",
        sequence: "space",
        handler: async () => {
          togglePlay();
        },
        label: "Toggle playback",
        description: "Play or pause synchronized playback",
        enablement: () => playback.canControlPlayback,
      },
      {
        commandId: "fo.modal.multimodal.playback.step-forward",
        sequence: ".",
        handler: async () => {
          await stepForward();
        },
        label: "Step forward",
        description: "Advance playback by one synchronized tick",
        enablement: () => playback.canControlPlayback,
      },
      {
        commandId: "fo.modal.multimodal.playback.step-backward",
        sequence: "\\,",
        handler: async () => {
          await stepBackward();
        },
        label: "Step backward",
        description: "Move playback back by one synchronized tick",
        enablement: () => playback.canControlPlayback,
      },
    ],
    [playback.canControlPlayback, stepBackward, stepForward, togglePlay]
  );

  const activePanelState = activePanel
    ? playback.panelStates[activePanel.panelId]
    : undefined;
  const activeLocationTopic = React.useMemo(() => {
    if (!catalog || !activePanel?.frameConfig.locationStreamId) {
      return null;
    }

    return (
      catalog.locationTopics.find(
        (topic) => topic.streamId === activePanel.frameConfig.locationStreamId
      ) ?? null
    );
  }, [activePanel?.frameConfig.locationStreamId, catalog]);

  const frameOptions = React.useMemo(() => {
    return [
      { value: "", label: "None" },
      ...(catalog?.frames ?? []).map((frame) => ({
        value: frame.frameId,
        label: frame.frameId,
      })),
    ];
  }, [catalog?.frames]);

  const locationOptions = React.useMemo(() => {
    return [
      { value: "", label: "None" },
      ...(catalog?.locationTopics ?? []).map((topic) => ({
        value: topic.streamId,
        label: topic.topic,
      })),
    ];
  }, [catalog?.locationTopics]);

  const updateActivePanel = React.useCallback(
    (
      updater: (panel: MultimodalPanelLayoutState) => MultimodalPanelLayoutState
    ) => {
      if (!activePanel) {
        return;
      }

      applyWorkspaceState(
        (current) =>
          updatePanelInWorkspaceState(current, activePanel.panelId, updater),
        "debounced"
      );
    },
    [activePanel, applyWorkspaceState]
  );

  const setActiveImagePrimaryStream = React.useCallback(
    (streamId: string | null) => {
      if (!catalog || !activePanel) {
        return;
      }

      applyWorkspaceState(
        (current) =>
          updatePanelInWorkspaceState(current, activePanel.panelId, (panel) => {
            if (panel.archetype !== "image") {
              return panel;
            }

            const currentAutoTitle = getSuggestedPanelTitle(
              catalog,
              panel,
              current.panels
            );
            const nextPanel = {
              ...panel,
              renderStreamId: streamId,
              visibleStreamIds: reconcileImageSupportStreamIds(
                catalog,
                streamId,
                panel.visibleStreamIds
              ),
            };

            if (
              !shouldSyncPanelTitleToStreams(
                panel.title,
                panel.archetype,
                currentAutoTitle
              )
            ) {
              return nextPanel;
            }

            return {
              ...nextPanel,
              title: getSuggestedPanelTitle(catalog, nextPanel, current.panels),
            };
          }),
        "debounced"
      );
    },
    [activePanel, applyWorkspaceState, catalog]
  );

  const setActiveImageProject3dOverlays = React.useCallback(
    (project3dOverlays: boolean) => {
      updateActivePanel((panel) => {
        if (panel.archetype !== "image") {
          return panel;
        }

        return {
          ...panel,
          imageConfig: {
            project3dOverlays,
          },
        };
      });
    },
    [updateActivePanel]
  );

  const toggleActiveImageSupportStream = React.useCallback(
    (streamId: string) => {
      updateActivePanel((panel) => {
        if (panel.archetype !== "image") {
          return panel;
        }

        const nextVisibleStreamIds = panel.visibleStreamIds.includes(streamId)
          ? panel.visibleStreamIds.filter(
              (visibleStreamId) => visibleStreamId !== streamId
            )
          : [...panel.visibleStreamIds, streamId];

        return {
          ...panel,
          visibleStreamIds: Array.from(new Set(nextVisibleStreamIds)),
        };
      });
    },
    [updateActivePanel]
  );

  const toggleSidebarSection = React.useCallback(
    (sectionId: SidebarSectionId) => {
      setCollapsedSections((current) => ({
        ...current,
        [sectionId]: !current[sectionId],
      }));
    },
    []
  );

  const inferActiveSplitDirection = React.useCallback(() => {
    const current = workspaceStateRef.current;
    const activePanelId =
      current?.activePanelId ?? current?.panels[0]?.panelId ?? null;
    if (!activePanelId) {
      return "row" as const;
    }

    const panelElement = panelElementRefs.current.get(activePanelId);
    if (!panelElement) {
      return "row" as const;
    }

    return panelElement.clientWidth >= panelElement.clientHeight
      ? ("row" as const)
      : ("column" as const);
  }, []);

  const addPanel = React.useCallback(
    (archetype: MultimodalPanelArchetype) => {
      React.startTransition(() => {
        applyWorkspaceState(
          (current) =>
            addPanelToWorkspaceState(current, archetype, {
              targetPanelId: current.activePanelId,
              direction: inferActiveSplitDirection(),
            }),
          "debounced"
        );
      });
    },
    [applyWorkspaceState, inferActiveSplitDirection]
  );

  const visibleFrameIds = React.useMemo(() => {
    if (!catalog || !activePanel) {
      return [];
    }

    if (activePanel.archetype === "image") {
      return [
        getStreamById(catalog, activePanel.renderStreamId)?.frameId,
        ...activePanel.visibleStreamIds
          .map((streamId) => {
            const stream = getStreamById(catalog, streamId);
            return shouldIncludeImageSupportFrameForPanel(activePanel, stream)
              ? stream?.frameId ?? null
              : null;
          })
          .filter((frameId): frameId is string => Boolean(frameId)),
      ];
    }

    return activePanel.visibleStreamIds.map(
      (streamId) => getStreamById(catalog, streamId)?.frameId
    );
  }, [activePanel, catalog]);

  const activeImagePrimaryStreams = React.useMemo(() => {
    if (!catalog || activePanel?.archetype !== "image") {
      return [];
    }

    return catalog.streams.filter((stream) => isImageRenderableStream(stream));
  }, [activePanel?.archetype, catalog]);

  const activeImageSupportStreams = React.useMemo(() => {
    if (!catalog || activePanel?.archetype !== "image") {
      return [];
    }

    return catalog.streams.filter((stream) => isImageSupportStream(stream));
  }, [activePanel?.archetype, catalog]);

  const activeImageAutoSupportStreamIds = React.useMemo(() => {
    if (!catalog || activePanel?.archetype !== "image") {
      return [];
    }

    return getDefaultImageSupportStreamIds(catalog, activePanel.renderStreamId);
  }, [activePanel?.archetype, activePanel?.renderStreamId, catalog]);
  const activeImageProject3dOverlays = React.useMemo(() => {
    return activePanel?.archetype === "image"
      ? isImage3dOverlayProjectionEnabled(activePanel)
      : false;
  }, [activePanel]);

  const filteredPrimaryImageStreams = React.useMemo(() => {
    return activeImagePrimaryStreams.filter((stream) =>
      matchesSearch(deferredSearchQuery, [
        "streams",
        "image",
        stream.topic,
        stream.schemaName,
        ...stream.affordances,
      ])
    );
  }, [activeImagePrimaryStreams, deferredSearchQuery]);

  const filteredImageSupportStreams = React.useMemo(() => {
    const autoBoundStreamIds = new Set(activeImageAutoSupportStreamIds);

    return [...activeImageSupportStreams]
      .filter((stream) =>
        matchesSearch(deferredSearchQuery, [
          "streams",
          "support",
          "overlay",
          stream.topic,
          stream.schemaName,
          ...stream.affordances,
        ])
      )
      .sort((left, right) => {
        const autoBoundDelta =
          Number(autoBoundStreamIds.has(right.streamId)) -
          Number(autoBoundStreamIds.has(left.streamId));
        if (autoBoundDelta !== 0) {
          return autoBoundDelta;
        }

        return left.topic.localeCompare(right.topic);
      });
  }, [
    activeImageAutoSupportStreamIds,
    activeImageSupportStreams,
    deferredSearchQuery,
  ]);

  const filteredPanelStreams = React.useMemo(() => {
    return catalog?.streams.filter((stream) =>
      matchesSearch(deferredSearchQuery, [
        "streams",
        stream.topic,
        stream.schemaName,
        ...stream.affordances,
      ])
    );
  }, [catalog?.streams, deferredSearchQuery]);

  const relevantTransforms = React.useMemo(() => {
    if (!catalog || !activePanel) {
      return [];
    }

    return getRelevantTransforms(catalog, [
      ...visibleFrameIds,
      activePanel.frameConfig.fixedFrameId,
      activePanel.frameConfig.displayFrameId,
      activeLocationTopic?.frameId,
    ]);
  }, [activeLocationTopic?.frameId, activePanel, catalog, visibleFrameIds]);

  const rootStyles = React.useMemo(() => {
    return {
      ...ROOT_STYLES,
      gridTemplateColumns: workspaceState?.sidebarCollapsed
        ? "minmax(0, 1fr)"
        : `${
            workspaceState?.sidebarWidth ?? DEFAULT_MULTIMODAL_SIDEBAR_WIDTH_PX
          }px ${SIDEBAR_RESIZER_WIDTH_PX}px minmax(0, 1fr)`,
    };
  }, [workspaceState?.sidebarCollapsed, workspaceState?.sidebarWidth]);

  const displayedLayoutTree = React.useMemo(() => {
    if (!workspaceState) {
      return null;
    }

    if (!workspaceState.maximizedPanelId) {
      return workspaceState.layoutTree;
    }

    const maximizedLayoutTree: MultimodalLayoutNode = {
      type: "leaf",
      panelId: workspaceState.maximizedPanelId,
    };

    return maximizedLayoutTree;
  }, [workspaceState]);

  const mosaicValue = React.useMemo(
    () => toMosaicNode(displayedLayoutTree),
    [displayedLayoutTree]
  );

  const renderTile = React.useCallback(
    (panelId: string, path: MosaicBranch[]) => {
      const currentState = workspaceStateRef.current;
      const panel = currentState?.panelsById[panelId];
      if (!catalog || !panel) {
        return null;
      }

      const panelState = playback.panelStates[panel.panelId];
      const streamLabel = getPanelStreamLabel(catalog, panel);
      const isActive = currentState?.activePanelId === panel.panelId;
      const isMaximized = currentState?.maximizedPanelId === panel.panelId;

      return (
        <div
          ref={(element) => {
            if (element) {
              panelElementRefs.current.set(panel.panelId, element);
            } else {
              panelElementRefs.current.delete(panel.panelId);
            }
          }}
          className={`mcap-panel-shell${isActive ? " is-active" : ""}`}
          data-testid={`multimodal-panel-card-${panel.panelId}`}
          onMouseDown={() => {
            applyWorkspaceState(
              (current) => selectPanelInWorkspaceState(current, panel.panelId),
              "none"
            );
          }}
        >
          <MosaicWindow<string>
            path={path}
            title={panel.title}
            toolbarControls={<></>}
            renderToolbar={() =>
              renderPanelToolbar({
                active: isActive,
                isMaximized: Boolean(isMaximized),
                panel,
                panelState,
                streamLabel,
                onClosePanel: () => {
                  applyWorkspaceState(
                    (current) =>
                      removePanelFromWorkspaceState(current, panel.panelId),
                    "debounced"
                  );
                },
                onToggleMaximize: () => {
                  applyWorkspaceState(
                    (current) =>
                      togglePanelMaximizedInWorkspaceState(
                        current,
                        panel.panelId
                      ),
                    "none"
                  );
                },
              })
            }
          >
            <PanelViewport
              catalog={catalog}
              isTimelineLoading={playback.isLoading}
              panel={panel}
              panelState={panelState}
            />
          </MosaicWindow>
        </div>
      );
    },
    [applyWorkspaceState, catalog, playback.isLoading, playback.panelStates]
  );

  if (isLoading || !catalog || !workspaceState) {
    return (
      <div data-testid="multimodal-shell-loading" style={ROOT_STYLES}>
        <div style={SIDEBAR_STYLES} />
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Sm}
          justify={Justify.Center}
          align={Align.Center}
          style={MAIN_STYLES}
        >
          <Spinner size={Size.Md} />
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            Loading workspace
          </Text>
        </Stack>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="multimodal-shell-error" style={ROOT_STYLES}>
        <div style={SIDEBAR_STYLES} />
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Sm}
          justify={Justify.Center}
          style={MAIN_STYLES}
        >
          <Heading level={HeadingLevel.H3}>Workspace unavailable</Heading>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            {error.message}
          </Text>
          <Button onClick={() => void refetch()} size={Size.Sm}>
            Retry
          </Button>
        </Stack>
      </div>
    );
  }

  return (
    <div
      data-testid="multimodal-workspace-shell"
      ref={workspaceShellRef}
      style={rootStyles}
    >
      {!workspaceState.sidebarCollapsed ? (
        <div data-testid="multimodal-workspace-sidebar" style={SIDEBAR_STYLES}>
          <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
            <Stack orientation={Orientation.Row} align={Align.Center}>
              <Button
                aria-label="Hide sidebar"
                leadingIcon={IconName.ChevronLeft}
                onClick={() =>
                  applyWorkspaceState(toggleSidebarInWorkspaceState, "none")
                }
                size={Size.Sm}
                title="Hide sidebar"
                variant={Variant.Icon}
              />
            </Stack>
            {activePanel ? (
              <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                <Stack
                  orientation={Orientation.Row}
                  spacing={Spacing.Xs}
                  align={Align.Center}
                >
                  <Pill
                    size={Size.Xs}
                    backgroundColor={BackgroundColor.Muted}
                    color={TextColor.Secondary}
                  >
                    {activePanel.archetype === "image" ? "2D" : "3D"}
                  </Pill>
                  <Text
                    variant={TextVariant.Caption}
                    color={TextColor.Secondary}
                  >
                    {getPanelStreamLabel(catalog, activePanel)}
                  </Text>
                </Stack>
                <Text variant={TextVariant.Sm} color={TextColor.Primary}>
                  {activePanel.title}
                </Text>
              </Stack>
            ) : (
              <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                No panel selected
              </Text>
            )}

            <Input
              placeholder="Search panel settings"
              type={InputType.Search}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />

            {activePanel ? (
              <>
                {matchesSearch(deferredSearchQuery, [
                  "panel title",
                  activePanel.title,
                ]) ? (
                  <SidebarSection
                    collapsed={collapsedSections.panelTitle}
                    forceExpanded={hasSearchQuery}
                    onToggle={() => toggleSidebarSection("panelTitle")}
                    title="Panel title"
                  >
                    <Input
                      value={activePanel.title}
                      onChange={(event) =>
                        updateActivePanel((panel) => ({
                          ...panel,
                          title: event.target.value,
                        }))
                      }
                    />
                  </SidebarSection>
                ) : null}

                {matchesSearch(deferredSearchQuery, [
                  "frame config",
                  "fixed frame",
                  "display frame",
                  "follow mode",
                  "location topic",
                  "enu frame",
                ]) ? (
                  <SidebarSection
                    collapsed={collapsedSections.frameConfig}
                    forceExpanded={hasSearchQuery}
                    onToggle={() => toggleSidebarSection("frameConfig")}
                    title="Frame config"
                  >
                    <SelectField
                      label="Fixed frame"
                      options={frameOptions}
                      value={activePanel.frameConfig.fixedFrameId}
                      onChange={(nextValue) =>
                        updateActivePanel((panel) => ({
                          ...panel,
                          frameConfig: {
                            ...panel.frameConfig,
                            fixedFrameId: nextValue,
                            displayFrameId:
                              panel.frameConfig.displayFrameId ?? nextValue,
                          },
                        }))
                      }
                    />
                    <SelectField
                      label="Display frame"
                      options={frameOptions}
                      value={
                        activePanel.frameConfig.displayFrameId ??
                        activePanel.frameConfig.fixedFrameId
                      }
                      onChange={(nextValue) =>
                        updateActivePanel((panel) => ({
                          ...panel,
                          frameConfig: {
                            ...panel.frameConfig,
                            displayFrameId: nextValue,
                          },
                        }))
                      }
                    />
                    <SelectField
                      label="Follow mode"
                      options={[
                        { value: "off", label: "Off" },
                        { value: "position", label: "Position" },
                        { value: "pose", label: "Pose" },
                      ]}
                      value={activePanel.frameConfig.followMode}
                      onChange={(nextValue) =>
                        updateActivePanel((panel) => ({
                          ...panel,
                          frameConfig: {
                            ...panel.frameConfig,
                            followMode: (nextValue ??
                              "off") as MultimodalFrameConfig["followMode"],
                          },
                        }))
                      }
                    />
                    <SelectField
                      label="Location topic"
                      options={locationOptions}
                      value={activePanel.frameConfig.locationStreamId}
                      onChange={(nextValue) =>
                        updateActivePanel((panel) => ({
                          ...panel,
                          frameConfig: {
                            ...panel.frameConfig,
                            locationStreamId: nextValue,
                          },
                        }))
                      }
                    />
                    <SelectField
                      disabled={activeLocationTopic?.mode !== "navsat"}
                      label="ENU frame"
                      options={frameOptions}
                      value={activePanel.frameConfig.enuFrameId}
                      onChange={(nextValue) =>
                        updateActivePanel((panel) => ({
                          ...panel,
                          frameConfig: {
                            ...panel.frameConfig,
                            enuFrameId: nextValue,
                          },
                        }))
                      }
                    />
                  </SidebarSection>
                ) : null}

                {matchesSearch(deferredSearchQuery, [
                  "scene config",
                  "up axis",
                  "background color",
                  "grid",
                  "show grid",
                ]) ? (
                  <SidebarSection
                    collapsed={collapsedSections.sceneConfig}
                    forceExpanded={hasSearchQuery}
                    onToggle={() => toggleSidebarSection("sceneConfig")}
                    title="Scene config"
                  >
                    <SelectField
                      label="Up axis"
                      options={[
                        { value: "x", label: "X" },
                        { value: "y", label: "Y" },
                        { value: "z", label: "Z" },
                      ]}
                      value={activePanel.sceneConfig.upAxis}
                      onChange={(nextValue) =>
                        updateActivePanel((panel) => ({
                          ...panel,
                          sceneConfig: {
                            ...panel.sceneConfig,
                            upAxis: (nextValue ??
                              "z") as MultimodalSceneConfig["upAxis"],
                          },
                        }))
                      }
                    />
                    <Stack
                      orientation={Orientation.Column}
                      spacing={Spacing.Xs}
                    >
                      <Text
                        variant={TextVariant.Caption}
                        color={TextColor.Secondary}
                      >
                        Background color
                      </Text>
                      <input
                        aria-label="background-color"
                        type="color"
                        value={activePanel.sceneConfig.backgroundColor}
                        onChange={(event) =>
                          updateActivePanel((panel) => ({
                            ...panel,
                            sceneConfig: {
                              ...panel.sceneConfig,
                              backgroundColor: event.target.value,
                            },
                          }))
                        }
                      />
                    </Stack>
                    {activePanel.archetype === "3d" ? (
                      <Stack
                        orientation={Orientation.Row}
                        justify={Justify.Between}
                        align={Align.Center}
                      >
                        <Text
                          variant={TextVariant.Caption}
                          color={TextColor.Secondary}
                        >
                          Show grid
                        </Text>
                        <input
                          aria-label="show-grid"
                          checked={activePanel.sceneConfig.showGrid ?? true}
                          onChange={(event) =>
                            updateActivePanel((panel) => ({
                              ...panel,
                              sceneConfig: {
                                ...panel.sceneConfig,
                                showGrid: event.target.checked,
                              },
                            }))
                          }
                          type="checkbox"
                        />
                      </Stack>
                    ) : null}
                  </SidebarSection>
                ) : null}

                {matchesSearch(deferredSearchQuery, [
                  "transforms",
                  ...relevantTransforms.map((transform) => transform.topic),
                  ...relevantTransforms.map(
                    (transform) => transform.parentFrameId
                  ),
                  ...relevantTransforms.map(
                    (transform) => transform.childFrameId
                  ),
                ]) ? (
                  <SidebarSection
                    collapsed={collapsedSections.transforms}
                    forceExpanded={hasSearchQuery}
                    onToggle={() => toggleSidebarSection("transforms")}
                    title="Transforms"
                  >
                    <Stack
                      orientation={Orientation.Column}
                      spacing={Spacing.Xs}
                    >
                      {relevantTransforms.length === 0 ? (
                        <Text
                          variant={TextVariant.Caption}
                          color={TextColor.Secondary}
                        >
                          No relevant transforms for the active panel
                        </Text>
                      ) : null}
                      {relevantTransforms.map((transform) => (
                        <Stack
                          key={`${transform.topic}:${transform.parentFrameId}:${transform.childFrameId}`}
                          orientation={Orientation.Column}
                          spacing={Spacing.Xs}
                          style={{
                            padding: "8px 0",
                            borderTop: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <Text
                            variant={TextVariant.Sm}
                            color={TextColor.Primary}
                          >
                            {`${transform.parentFrameId} -> ${transform.childFrameId}`}
                          </Text>
                          <Stack
                            orientation={Orientation.Row}
                            spacing={Spacing.Xs}
                          >
                            <Pill
                              size={Size.Xs}
                              backgroundColor={BackgroundColor.Muted}
                              color={TextColor.Secondary}
                            >
                              {transform.topic}
                            </Pill>
                            <Pill
                              size={Size.Xs}
                              backgroundColor={BackgroundColor.Secondary}
                              color={TextColor.Primary}
                            >
                              {transform.isStatic ? "static" : "dynamic"}
                            </Pill>
                          </Stack>
                        </Stack>
                      ))}
                      {activePanelState?.warnings.map((warning) => (
                        <Text
                          key={warning}
                          variant={TextVariant.Caption}
                          color={TextColor.Secondary}
                        >
                          {warning}
                        </Text>
                      ))}
                    </Stack>
                  </SidebarSection>
                ) : null}

                {matchesSearch(deferredSearchQuery, [
                  "streams",
                  "project 3d overlays",
                  "projected overlays",
                  ...catalog.streams.map((stream) => stream.topic),
                ]) ? (
                  <SidebarSection
                    collapsed={collapsedSections.streams}
                    forceExpanded={hasSearchQuery}
                    onToggle={() => toggleSidebarSection("streams")}
                    title="Streams"
                  >
                    <Stack
                      orientation={Orientation.Column}
                      spacing={Spacing.Xs}
                    >
                      {activePanel.archetype === "image" ? (
                        <>
                          <Stack
                            orientation={Orientation.Column}
                            spacing={Spacing.Xs}
                          >
                            <Text
                              variant={TextVariant.Caption}
                              color={TextColor.Secondary}
                            >
                              Primary image
                            </Text>
                            {filteredPrimaryImageStreams.length === 0 ? (
                              <Text
                                variant={TextVariant.Caption}
                                color={TextColor.Secondary}
                              >
                                No image streams match the current filter
                              </Text>
                            ) : null}
                            {filteredPrimaryImageStreams.map((stream) => (
                              <StreamRow
                                key={stream.streamId}
                                activePanel={activePanel}
                                checked={
                                  activePanel.renderStreamId === stream.streamId
                                }
                                controlType="radio"
                                disabled={false}
                                groupName={`${activePanel.panelId}:image-primary`}
                                onToggle={() =>
                                  setActiveImagePrimaryStream(
                                    activePanel.renderStreamId ===
                                      stream.streamId
                                      ? null
                                      : stream.streamId
                                  )
                                }
                                stream={stream}
                              />
                            ))}
                          </Stack>

                          <Stack
                            orientation={Orientation.Column}
                            spacing={Spacing.Xs}
                            style={{
                              marginTop: "8px",
                              paddingTop: "8px",
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            <Text
                              variant={TextVariant.Caption}
                              color={TextColor.Secondary}
                            >
                              Support overlays
                            </Text>
                            <Stack
                              orientation={Orientation.Row}
                              justify={Justify.Between}
                              align={Align.Center}
                            >
                              <Text
                                variant={TextVariant.Caption}
                                color={TextColor.Secondary}
                              >
                                Project 3D overlays
                              </Text>
                              <input
                                aria-label="project-3d-overlays"
                                checked={activeImageProject3dOverlays}
                                onChange={(event) =>
                                  setActiveImageProject3dOverlays(
                                    event.target.checked
                                  )
                                }
                                type="checkbox"
                              />
                            </Stack>
                            <Text
                              variant={TextVariant.Caption}
                              color={TextColor.Secondary}
                            >
                              Matching annotations and camera info auto-bind
                              when the primary image changes. `SceneUpdate`
                              stays manual.
                            </Text>
                            <Text
                              variant={TextVariant.Caption}
                              color={TextColor.Secondary}
                            >
                              Projected 3D support streams honor this toggle.
                            </Text>
                            {filteredImageSupportStreams.length === 0 ? (
                              <Text
                                variant={TextVariant.Caption}
                                color={TextColor.Secondary}
                              >
                                No support streams match the current filter
                              </Text>
                            ) : null}
                            {filteredImageSupportStreams.map((stream) => (
                              <StreamRow
                                key={stream.streamId}
                                activePanel={activePanel}
                                checked={activePanel.visibleStreamIds.includes(
                                  stream.streamId
                                )}
                                disabled={false}
                                onToggle={() =>
                                  toggleActiveImageSupportStream(
                                    stream.streamId
                                  )
                                }
                                stream={stream}
                              />
                            ))}
                          </Stack>
                        </>
                      ) : (
                        filteredPanelStreams?.map((stream) => {
                          const isCompatible = canBindStreamToPanel(
                            stream,
                            activePanel.archetype
                          );

                          return (
                            <StreamRow
                              key={stream.streamId}
                              activePanel={activePanel}
                              checked={activePanel.visibleStreamIds.includes(
                                stream.streamId
                              )}
                              disabled={!isCompatible}
                              onToggle={() => {
                                if (!isCompatible) {
                                  return;
                                }

                                applyWorkspaceState(
                                  (current) =>
                                    updatePanelInWorkspaceState(
                                      current,
                                      activePanel.panelId,
                                      (panel) => {
                                        const nextVisibleStreamIds =
                                          panel.visibleStreamIds.includes(
                                            stream.streamId
                                          )
                                            ? panel.visibleStreamIds.filter(
                                                (streamId) =>
                                                  streamId !== stream.streamId
                                              )
                                            : [
                                                ...panel.visibleStreamIds,
                                                stream.streamId,
                                              ];
                                        const currentAutoTitle =
                                          getSuggestedPanelTitle(
                                            catalog,
                                            panel,
                                            current.panels
                                          );
                                        const nextPanel = {
                                          ...panel,
                                          visibleStreamIds:
                                            nextVisibleStreamIds,
                                        };

                                        if (
                                          !shouldSyncPanelTitleToStreams(
                                            panel.title,
                                            panel.archetype,
                                            currentAutoTitle
                                          )
                                        ) {
                                          return nextPanel;
                                        }

                                        return {
                                          ...nextPanel,
                                          title: getSuggestedPanelTitle(
                                            catalog,
                                            nextPanel,
                                            current.panels
                                          ),
                                        };
                                      }
                                    ),
                                  "debounced"
                                );
                              }}
                              stream={stream}
                            />
                          );
                        })
                      )}
                    </Stack>
                  </SidebarSection>
                ) : null}
              </>
            ) : null}
          </Stack>
        </div>
      ) : null}
      {!workspaceState.sidebarCollapsed ? (
        <div
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          data-testid="multimodal-workspace-sidebar-resizer"
          onPointerDown={(event) => {
            event.preventDefault();
            startSidebarResize(event.clientX);
          }}
          onPointerMove={(event) => {
            updateSidebarResize(event.clientX);
          }}
          onPointerUp={() => {
            finishSidebarResize();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            startSidebarResize(event.clientX);
          }}
          onMouseMove={(event) => {
            updateSidebarResize(event.clientX);
          }}
          onMouseUp={() => {
            finishSidebarResize();
          }}
          role="separator"
          style={SIDEBAR_RESIZER_STYLES}
        >
          <div aria-hidden="true" style={SIDEBAR_RESIZER_GRIP_STYLES} />
        </div>
      ) : null}

      <div data-testid="multimodal-workspace-main" style={MAIN_STYLES}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Xs}
          style={{ height: "100%" }}
        >
          <div style={TOOLBAR_STYLES}>
            <Stack
              orientation={Orientation.Row}
              justify={Justify.Between}
              align={Align.Center}
            >
              <Stack
                orientation={Orientation.Row}
                spacing={Spacing.Sm}
                align={Align.Center}
                style={{ minWidth: 0 }}
              >
                {workspaceState.sidebarCollapsed ? (
                  <Button
                    aria-label="Show sidebar"
                    leadingIcon={IconName.ChevronRight}
                    onClick={() =>
                      applyWorkspaceState(toggleSidebarInWorkspaceState, "none")
                    }
                    size={Size.Sm}
                    title="Show sidebar"
                    variant={Variant.Icon}
                  />
                ) : null}
                <Text variant={TextVariant.Sm} color={TextColor.Primary}>
                  {info.basename}
                </Text>
                <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
                  {`${catalog.streams.length} streams · ${catalog.frames.length} frames · ${workspaceState.panels.length} panels`}
                </Text>
                {isSaving ? (
                  <Text
                    data-testid="multimodal-workspace-saving"
                    variant={TextVariant.Caption}
                    color={TextColor.Secondary}
                  >
                    Saving layout
                  </Text>
                ) : null}
                {saveError ? (
                  <Stack
                    orientation={Orientation.Row}
                    spacing={Spacing.Xs}
                    align={Align.Center}
                  >
                    <Text
                      data-testid="multimodal-workspace-save-error"
                      variant={TextVariant.Caption}
                      color={TextColor.Secondary}
                    >
                      Save failed
                    </Text>
                    <button
                      className="mcap-panel-toolbar-button"
                      onClick={() => {
                        const current = workspaceStateRef.current;
                        if (current) {
                          clearSaveError();
                          void persistWorkspaceState(current);
                        }
                      }}
                      type="button"
                    >
                      Retry
                    </button>
                  </Stack>
                ) : null}
              </Stack>
              <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
                <Button
                  leadingIcon={IconName.Add}
                  onClick={() => addPanel("image")}
                  size={Size.Sm}
                  variant={Variant.Secondary}
                >
                  Image
                </Button>
                <Button
                  leadingIcon={IconName.Add}
                  onClick={() => addPanel("3d")}
                  size={Size.Sm}
                  variant={Variant.Secondary}
                >
                  3D
                </Button>
              </Stack>
            </Stack>
          </div>

          <div style={MOSAIC_CONTAINER_STYLES}>
            <Mosaic<string>
              className="multimodal-mosaic"
              onChange={(nextNode) => {
                React.startTransition(() => {
                  applyWorkspaceState(
                    (current) =>
                      setLayoutTreeInWorkspaceState(
                        current,
                        fromMosaicNode(nextNode)
                      ),
                    "none"
                  );
                });
              }}
              onRelease={(nextNode) => {
                applyWorkspaceState(
                  (current) =>
                    setLayoutTreeInWorkspaceState(
                      current,
                      fromMosaicNode(nextNode)
                    ),
                  "immediate"
                );
              }}
              renderTile={renderTile}
              resize={{ minimumPaneSizePercentage: 12 }}
              value={mosaicValue}
              zeroStateView={
                <Stack
                  data-testid="multimodal-workspace-empty"
                  orientation={Orientation.Column}
                  spacing={Spacing.Sm}
                  justify={Justify.Center}
                  align={Align.Center}
                  style={{
                    height: "100%",
                    border: "1px dashed rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    padding: "14px",
                  }}
                >
                  <Text variant={TextVariant.Sm} color={TextColor.Primary}>
                    No panels open
                  </Text>
                  <Text
                    variant={TextVariant.Caption}
                    color={TextColor.Secondary}
                  >
                    Add an image or 3D panel from the toolbar to keep exploring.
                  </Text>
                </Stack>
              }
            />
          </div>
        </Stack>

        {playback.timelineName && playback.hasPlayback ? (
          <div
            data-testid="multimodal-workspace-timeline"
            style={TIMELINE_DOCK_STYLES}
          >
            <MultimodalTimelineDock
              timelineState={playback.timelineState}
              timestampSource={playback.timeline?.timestampSource ?? null}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
