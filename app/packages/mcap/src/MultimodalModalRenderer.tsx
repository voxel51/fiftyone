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
import { Image2dView, Points3dView } from "./archetypes";
import { canBindStreamToPanel } from "./panel-binding-registry";
import { formatMultimodalDuration, getStreamById } from "./scene-view-model";
import {
  getMultimodalRendererInfo,
  getMultimodalSceneParams,
} from "./renderer-utils";
import { getRelevantTransforms } from "./transform-runtime";
import type {
  MultimodalCatalog,
  MultimodalFrameConfig,
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
  createWorkspaceStateFromRenderingPlan,
  getActivePanel,
  removePanelFromWorkspaceState,
  selectPanelInWorkspaceState,
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
  gridTemplateColumns: "272px minmax(0, 1fr)",
  background:
    "linear-gradient(180deg, rgba(11,18,29,1) 0%, rgba(15,23,36,1) 100%)",
};

const SIDEBAR_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  borderRight: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(6, 11, 18, 0.88)",
  padding: "8px",
  overflow: "auto",
};

const WORKSPACE_STYLES: React.CSSProperties = {
  position: "relative",
  minWidth: 0,
  minHeight: 0,
  padding: "0 0 72px",
  overflow: "hidden",
};

const TOOLBAR_STYLES: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 0,
  borderWidth: "0 0 1px",
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.08)",
  background: "rgba(9, 15, 24, 0.74)",
};

const GRID_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gridAutoRows: "minmax(156px, 1fr)",
  gridAutoFlow: "dense",
  gap: "4px",
  height: "100%",
  overflow: "auto",
  alignContent: "start",
  padding: "4px",
};

const PANEL_CARD_STYLES: React.CSSProperties = {
  height: "100%",
  minHeight: 0,
  borderRadius: 0,
  padding: "6px",
  overflow: "hidden",
  cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.08)",
};

const PANEL_VIEWPORT_STYLES: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  flex: 1,
  borderRadius: 0,
  overflow: "hidden",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.04)",
};

const TIMELINE_DOCK_STYLES: React.CSSProperties = {
  position: "absolute",
  left: "0",
  right: "0",
  bottom: "0",
  padding: "10px 12px",
  borderRadius: 0,
  borderWidth: "1px 0 0",
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.1)",
  background: "rgba(8, 13, 20, 0.9)",
  backdropFilter: "blur(10px)",
};

const SECTION_CARD_STYLES: React.CSSProperties = {
  borderRadius: 0,
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
  borderRadius: 0,
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

const PANEL_MENU_WRAPPER_STYLES: React.CSSProperties = {
  position: "relative",
};

const PANEL_MENU_STYLES: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  zIndex: 5,
  minWidth: "160px",
  padding: "8px",
  borderRadius: 0,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(8, 13, 20, 0.96)",
  boxShadow: "0 18px 40px rgba(0, 0, 0, 0.35)",
};

const PANEL_MENU_ITEM_STYLES: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 0,
  padding: "8px 10px",
  background: "transparent",
  color: "white",
  textAlign: "left",
  cursor: "pointer",
};

const GRID_EMPTY_STYLES: React.CSSProperties = {
  minHeight: 0,
  height: "100%",
  gridColumn: "1 / -1",
  borderRadius: 0,
  border: "1px dashed rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
  padding: "14px",
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

function getPanelGridStyle(
  panel: MultimodalPanelLayoutState,
  maximizedPanelId: string | null
): React.CSSProperties {
  if (maximizedPanelId) {
    return {};
  }

  return {
    gridColumn: `${panel.layout.x + 1} / span ${panel.layout.w}`,
    gridRow: `${panel.layout.y + 1} / span ${panel.layout.h}`,
  };
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
    left.backgroundColor === right.backgroundColor
  );
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
          borderRadius: "8px",
          padding: "8px 10px",
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
  disabled,
  onToggle,
  stream,
}: {
  activePanel: MultimodalPanelLayoutState;
  checked: boolean;
  disabled: boolean;
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
        onChange={onToggle}
        type="checkbox"
      />
    </Stack>
  );
}

function PanelActionMenu({
  isMaximized,
  onClosePanel,
  onToggleMaximize,
}: {
  isMaximized: boolean;
  onClosePanel: () => void;
  onToggleMaximize: () => void;
}) {
  return (
    <div style={PANEL_MENU_STYLES} onClick={(event) => event.stopPropagation()}>
      <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
        <button
          style={PANEL_MENU_ITEM_STYLES}
          type="button"
          onClick={onToggleMaximize}
        >
          {isMaximized ? "Restore panel" : "Maximize panel"}
        </button>
        <button
          style={PANEL_MENU_ITEM_STYLES}
          type="button"
          onClick={onClosePanel}
        >
          Close panel
        </button>
      </Stack>
    </div>
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
      } clock aligned across all visible panels`}
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

export function MultimodalModalRenderer({ ctx }: SampleRendererProps) {
  const info = getMultimodalRendererInfo(ctx);
  const params = React.useMemo(() => getMultimodalSceneParams(ctx), [ctx]);
  const { catalog, renderingPlan, isLoading, error, refetch } =
    useMultimodalWorkspace(params);
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
  const [openPanelMenuId, setOpenPanelMenuId] = React.useState<string | null>(
    null
  );
  const [collapsedSections, setCollapsedSections] = React.useState<
    Record<SidebarSectionId, boolean>
  >(() => DEFAULT_SIDEBAR_SECTION_STATE);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const hasSearchQuery = deferredSearchQuery.trim().length > 0;

  React.useEffect(() => {
    if (!renderingPlan) {
      setWorkspaceState(null);
      return;
    }

    setWorkspaceState((current) => {
      if (current?.sceneId === renderingPlan.sceneId) {
        return current;
      }

      return createWorkspaceStateFromRenderingPlan(renderingPlan);
    });
    setOpenPanelMenuId(null);
  }, [renderingPlan, renderingPlanKey]);

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
      if (!workspaceState || !activePanel) {
        return;
      }

      setWorkspaceState(
        updatePanelInWorkspaceState(
          workspaceState,
          activePanel.panelId,
          updater
        )
      );
    },
    [activePanel, workspaceState]
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

  const addPanel = React.useCallback(
    (archetype: MultimodalPanelArchetype) => {
      if (!workspaceState) {
        return;
      }

      React.startTransition(() => {
        setWorkspaceState(addPanelToWorkspaceState(workspaceState, archetype));
      });
    },
    [workspaceState]
  );

  const visibleFrameIds = React.useMemo(() => {
    if (!catalog || !activePanel) {
      return [];
    }

    if (activePanel.archetype === "image") {
      return [getStreamById(catalog, activePanel.renderStreamId)?.frameId];
    }

    return activePanel.visibleStreamIds.map(
      (streamId) => getStreamById(catalog, streamId)?.frameId
    );
  }, [activePanel, catalog]);

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
        : ROOT_STYLES.gridTemplateColumns,
    };
  }, [workspaceState?.sidebarCollapsed]);

  const gridStyles = React.useMemo(() => {
    return {
      ...GRID_STYLES,
      gridTemplateColumns: workspaceState?.maximizedPanelId
        ? "minmax(0, 1fr)"
        : GRID_STYLES.gridTemplateColumns,
      gridAutoRows: workspaceState?.maximizedPanelId
        ? "minmax(0, 1fr)"
        : GRID_STYLES.gridAutoRows,
    };
  }, [workspaceState?.maximizedPanelId]);

  const displayedPanels = React.useMemo(() => {
    if (!workspaceState) {
      return [];
    }

    if (!workspaceState.maximizedPanelId) {
      return workspaceState.panels;
    }

    return workspaceState.panels.filter(
      (panel) => panel.panelId === workspaceState.maximizedPanelId
    );
  }, [workspaceState]);

  const activePanelHeading = activePanel
    ? activePanel.archetype === "image"
      ? "Image panel"
      : "3D panel"
    : "No panel selected";

  if (isLoading || !catalog || !workspaceState) {
    return (
      <div data-testid="multimodal-shell-loading" style={ROOT_STYLES}>
        <div style={SIDEBAR_STYLES} />
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Sm}
          justify={Justify.Center}
          align={Align.Center}
          style={WORKSPACE_STYLES}
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
          style={WORKSPACE_STYLES}
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
      style={rootStyles}
      onClick={() => setOpenPanelMenuId(null)}
    >
      {!workspaceState.sidebarCollapsed && (
        <div data-testid="multimodal-workspace-sidebar" style={SIDEBAR_STYLES}>
          <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
            <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
              <Heading level={HeadingLevel.H3}>{activePanelHeading}</Heading>
              <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                {`${
                  catalog.streams.length
                } streams · ${formatMultimodalDuration(catalog.timeRange)}`}
              </Text>
            </Stack>

            <Input
              placeholder="Search panel settings"
              type={InputType.Search}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />

            {activePanel && (
              <>
                {matchesSearch(deferredSearchQuery, [
                  "panel title",
                  activePanel.title,
                ]) && (
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
                )}

                {matchesSearch(deferredSearchQuery, [
                  "frame config",
                  "fixed frame",
                  "display frame",
                  "follow mode",
                  "location topic",
                  "enu frame",
                ]) && (
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
                )}

                {matchesSearch(deferredSearchQuery, [
                  "scene config",
                  "up axis",
                  "background color",
                ]) && (
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
                  </SidebarSection>
                )}

                {matchesSearch(deferredSearchQuery, [
                  "transforms",
                  ...relevantTransforms.map((transform) => transform.topic),
                  ...relevantTransforms.map(
                    (transform) => transform.parentFrameId
                  ),
                  ...relevantTransforms.map(
                    (transform) => transform.childFrameId
                  ),
                ]) && (
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
                      {relevantTransforms.length === 0 && (
                        <Text
                          variant={TextVariant.Caption}
                          color={TextColor.Secondary}
                        >
                          No relevant transforms for the active panel
                        </Text>
                      )}
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
                )}

                {matchesSearch(deferredSearchQuery, [
                  "streams",
                  ...catalog.streams.map((stream) => stream.topic),
                ]) && (
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
                      {catalog.streams
                        .filter((stream) =>
                          matchesSearch(deferredSearchQuery, [
                            "streams",
                            stream.topic,
                            stream.schemaName,
                            ...stream.affordances,
                          ])
                        )
                        .map((stream) => {
                          const isCompatible = canBindStreamToPanel(
                            stream,
                            activePanel.archetype
                          );
                          const checked =
                            activePanel.archetype === "image"
                              ? activePanel.renderStreamId === stream.streamId
                              : activePanel.visibleStreamIds.includes(
                                  stream.streamId
                                );

                          return (
                            <StreamRow
                              key={stream.streamId}
                              activePanel={activePanel}
                              checked={checked}
                              disabled={!isCompatible}
                              onToggle={() => {
                                if (!isCompatible) {
                                  return;
                                }

                                updateActivePanel((panel) => {
                                  if (panel.archetype === "image") {
                                    return {
                                      ...panel,
                                      renderStreamId:
                                        panel.renderStreamId === stream.streamId
                                          ? null
                                          : stream.streamId,
                                    };
                                  }

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

                                  return {
                                    ...panel,
                                    visibleStreamIds: nextVisibleStreamIds,
                                  };
                                });
                              }}
                              stream={stream}
                            />
                          );
                        })}
                    </Stack>
                  </SidebarSection>
                )}
              </>
            )}
          </Stack>
        </div>
      )}

      <div data-testid="multimodal-workspace-main" style={WORKSPACE_STYLES}>
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Xs}
          style={{ height: "100%" }}
        >
          <Card
            background={CardBackground.Secondary}
            outlined
            style={TOOLBAR_STYLES}
          >
            <Stack
              orientation={Orientation.Row}
              justify={Justify.Between}
              align={Align.Center}
            >
              <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                <Heading level={HeadingLevel.H3}>{info.basename}</Heading>
                <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                  {`${catalog.streams.length} streams · ${catalog.frames.length} frames · ${catalog.locationTopics.length} location topics`}
                </Text>
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
                <Button
                  aria-label={
                    workspaceState.sidebarCollapsed
                      ? "Show sidebar"
                      : "Hide sidebar"
                  }
                  title={
                    workspaceState.sidebarCollapsed
                      ? "Show sidebar"
                      : "Hide sidebar"
                  }
                  leadingIcon={
                    workspaceState.sidebarCollapsed
                      ? IconName.ChevronRight
                      : IconName.ChevronLeft
                  }
                  onClick={() =>
                    setWorkspaceState((current) =>
                      current ? toggleSidebarInWorkspaceState(current) : current
                    )
                  }
                  size={Size.Sm}
                  variant={Variant.Icon}
                />
              </Stack>
            </Stack>
          </Card>

          <div data-testid="multimodal-workspace-grid" style={gridStyles}>
            {displayedPanels.length === 0 && (
              <Stack
                data-testid="multimodal-workspace-empty"
                orientation={Orientation.Column}
                spacing={Spacing.Sm}
                justify={Justify.Center}
                align={Align.Center}
                style={GRID_EMPTY_STYLES}
              >
                <Text variant={TextVariant.Sm} color={TextColor.Primary}>
                  No panels open
                </Text>
                <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
                  Add an image or 3D panel from the toolbar to keep exploring.
                </Text>
              </Stack>
            )}
            {displayedPanels.map((panel) => {
              const panelState = playback.panelStates[panel.panelId];
              const streamLabel =
                panel.archetype === "image"
                  ? getStreamById(catalog, panel.renderStreamId)?.topic ??
                    "Unbound"
                  : panel.visibleStreamIds.length
                  ? `${panel.visibleStreamIds.length} streams`
                  : "Unbound";

              return (
                <Card
                  key={panel.panelId}
                  data-testid={`multimodal-panel-card-${panel.panelId}`}
                  background={CardBackground.Secondary}
                  outlined
                  style={{
                    ...PANEL_CARD_STYLES,
                    ...getPanelGridStyle(
                      panel,
                      workspaceState.maximizedPanelId
                    ),
                    boxShadow:
                      workspaceState.activePanelId === panel.panelId
                        ? "0 0 0 1px rgba(94, 194, 255, 0.7)"
                        : "none",
                  }}
                  onClick={() =>
                    setWorkspaceState((current) =>
                      current
                        ? selectPanelInWorkspaceState(current, panel.panelId)
                        : current
                    )
                  }
                >
                  <Stack
                    orientation={Orientation.Column}
                    spacing={Spacing.Xs}
                    style={{ height: "100%" }}
                  >
                    <Stack
                      orientation={Orientation.Row}
                      justify={Justify.Between}
                      align={Align.Center}
                    >
                      <Stack
                        orientation={Orientation.Column}
                        spacing={Spacing.Xs}
                      >
                        <Text
                          variant={TextVariant.Sm}
                          color={TextColor.Primary}
                        >
                          {panel.title}
                        </Text>
                        <Text
                          variant={TextVariant.Caption}
                          color={TextColor.Secondary}
                        >
                          {streamLabel}
                        </Text>
                      </Stack>
                      <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
                        <Pill
                          size={Size.Xs}
                          backgroundColor={BackgroundColor.Muted}
                          color={TextColor.Secondary}
                        >
                          {panel.archetype === "image" ? "2D" : "3D"}
                        </Pill>
                        <Pill
                          size={Size.Xs}
                          backgroundColor={BackgroundColor.Secondary}
                          color={TextColor.Primary}
                        >
                          {panelState?.status ?? "idle"}
                        </Pill>
                        <div style={PANEL_MENU_WRAPPER_STYLES}>
                          <Button
                            aria-label={`Panel actions for ${panel.title}`}
                            data-testid={`multimodal-panel-menu-button-${panel.panelId}`}
                            leadingIcon={IconName.MoreVertical}
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenPanelMenuId((current) =>
                                current === panel.panelId ? null : panel.panelId
                              );
                            }}
                            size={Size.Sm}
                            title="Panel actions"
                            variant={Variant.Icon}
                          />
                          {openPanelMenuId === panel.panelId && (
                            <PanelActionMenu
                              isMaximized={
                                workspaceState.maximizedPanelId ===
                                panel.panelId
                              }
                              onClosePanel={() => {
                                setOpenPanelMenuId(null);
                                setWorkspaceState((current) =>
                                  current
                                    ? removePanelFromWorkspaceState(
                                        current,
                                        panel.panelId
                                      )
                                    : current
                                );
                              }}
                              onToggleMaximize={() => {
                                setOpenPanelMenuId(null);
                                setWorkspaceState((current) =>
                                  current
                                    ? togglePanelMaximizedInWorkspaceState(
                                        current,
                                        panel.panelId
                                      )
                                    : current
                                );
                              }}
                            />
                          )}
                        </div>
                      </Stack>
                    </Stack>

                    <PanelViewport
                      catalog={catalog}
                      isTimelineLoading={playback.isLoading}
                      panel={panel}
                      panelState={panelState}
                    />
                  </Stack>
                </Card>
              );
            })}
          </div>
        </Stack>

        {playback.timelineName && playback.hasPlayback && (
          <div
            data-testid="multimodal-workspace-timeline"
            style={TIMELINE_DOCK_STYLES}
          >
            <MultimodalTimelineDock
              timelineState={playback.timelineState}
              timestampSource={playback.timeline?.timestampSource ?? null}
            />
          </div>
        )}
      </div>
    </div>
  );
}
