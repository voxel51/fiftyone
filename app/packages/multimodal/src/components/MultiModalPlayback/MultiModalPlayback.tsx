import {
  MosaicGrid,
  TileSettingsSidebar,
  TilingHeader,
  TilingInspectorSidebar,
  TilingProvider,
  TilingZeroState,
  useTiling,
  type TilingAutoLayoutStrategy,
  type TilingHeaderCaption,
  type TilingTile,
} from "@fiftyone/tiling";
import { Drawer } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useCallback, useRef, useState, type ReactNode } from "react";
import type { MosaicNode } from "react-mosaic-component";
import {
  PlaybackProvider,
  TemporalTagTimeline,
  TrackProvider,
  type TemporalTagTimelineProps,
  type Track,
} from "@fiftyone/playback";
import {
  SceneInventoryProvider,
  type SceneSource,
} from "../../scene-inventory";
import { WebGpuViewStage } from "../../visualization/panels/gpu/webgpu-view-stage";
import styles from "./MultiModalPlayback.module.css";

const EMPTY_SOURCES: readonly SceneSource[] = [];
const SIDEBAR_SIZE_PX = 360;

// User-resizable bounds for the left sidebar. MIN keeps the settings
// controls readable (labels + inputs don't wrap into uselessness below
// ~280); MAX stops the sidebar from crowding the tiles out of the modal.
export const SIDEBAR_MIN_WIDTH_PX = 280;
export const SIDEBAR_MAX_WIDTH_PX = 560;

/** Clamp a requested sidebar width to the resizable bounds. */
export function clampSidebarWidth(px: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH_PX,
    Math.max(SIDEBAR_MIN_WIDTH_PX, Math.round(px)),
  );
}

export interface MultiModalPlaybackProps {
  /** Filename rendered on the left of the top bar. */
  fileName: string;
  /** Optional caption rendered below the filename in the top bar. */
  headerCaption?: TilingHeaderCaption;
  /** Optional compact controls rendered beside the filename/caption stack. */
  headerActions?: ReactNode;

  /**
   * Custom content for the add-tile menus (voodo Menu* primitives),
   * shared by the header's add-tile dropdown and the empty-canvas zero
   * state. Defaults to the registered tile kinds; pass a source-first
   * catalog to let users pick actual streams.
   */
  addTileMenu?: ReactNode;

  /**
   * Extra controls appended to the timeline's controls row (after the
   * transport buttons) — e.g. an absolute-timestamp readout. Composed
   * with the timeline's own actions, not replacing them.
   */
  timelineExtraActions?: ReactNode;

  /** Tracks broadcast through the embedded TrackProvider. */
  tracks?: Track[];
  /** Track ids that should start pinned to the timeline. */
  defaultPinnedTrackIds?: string[];

  /** Initial tile entries seeded into the embedded TilingProvider. */
  initialTiles?: Record<string, TilingTile>;
  /** Initial user-authored tile titles keyed by tile id. */
  initialManualTileTitles?: Record<string, string>;
  /** Optional host-specific layout builder for the toolbar Auto Layout action. */
  autoLayoutStrategy?: TilingAutoLayoutStrategy;

  /**
   * Initial mosaic tree seeded into the embedded TilingProvider. Leave
   * `undefined` to auto-lay-out `initialTiles`; pass an explicit tree to
   * restore a saved arrangement.
   */
  initialLayout?: MosaicNode<string> | null;
  /** Tile id that should start expanded to fullscreen. */
  initialExpandedTileId?: string | null;

  /** Discoverable data sources for the current scene. */
  sceneSources?: readonly SceneSource[];

  /**
   * Hosts compatible image panels in one lazily-mounted WebGPU canvas.
   * Disabled by default so playback consumers opt into the shared renderer.
   */
  sharedImageWebGpuViews?: boolean;

  /**
   * Whether selecting the already-focused tile clears focus. Defaults to the
   * existing toggle behavior; surfaces with persistent panel settings can opt
   * out so repeat clicks keep the panel active.
   */
  deselectFocusedTileOnRepeatSelect?: boolean;

  /**
   * Override for the left sidebar. Defaults to {@link TileSettingsSidebar}
   * (focused tile's settings).
   */
  leftSidebar?: ReactNode;
  /**
   * Override for the right sidebar. Defaults to {@link TilingInspectorSidebar}
   * (focused tile's selection payload as JSON). Pass `null` explicitly to
   * remove the right sidebar entirely — no drawer and no header toggle.
   */
  rightSidebar?: ReactNode;
  /** Whether the left sidebar starts open. @default true */
  defaultLeftOpen?: boolean;
  /** Whether the right sidebar starts open. @default true */
  defaultRightOpen?: boolean;
  /** Observes left-sidebar visibility — e.g. to persist the choice. */
  onLeftOpenChange?: (open: boolean) => void;
  /** Observes right-sidebar visibility — e.g. to persist the choice. */
  onRightOpenChange?: (open: boolean) => void;
  /**
   * Starting width of the left sidebar in px, clamped to
   * {@link SIDEBAR_MIN_WIDTH_PX}–{@link SIDEBAR_MAX_WIDTH_PX}. The pane
   * is drag-resizable via its edge handle either way; this only seeds
   * the width (uncontrolled, like `defaultLeftOpen`). Defaults to the
   * fixed 360px the shell has always used.
   */
  leftSidebarWidth?: number;
  /**
   * Observes the left sidebar width at drag end — e.g. to persist the
   * choice. Not called at pointer-move cadence.
   */
  onLeftSidebarWidthChange?: (px: number) => void;

  /**
   * Callback that persists a newly-created temporal tag.  When provided,
   * the temporal-tag workflow is enabled in the timeline (button, `T`
   * hotkey, Shift+drag).
   */
  onTagCreate?: TemporalTagTimelineProps["onTagCreate"];
  /** Callback that deletes an existing temporal tag by its backend id. */
  onTagDelete?: NonNullable<
    TemporalTagTimelineProps["eventMenuItems"]
  >[number]["onSelect"];

  /**
   * Rendered inside the providers this component owns. Use it for
   * one-time setup that needs to call into the playback engine, the
   * tiling provider, or the track provider — e.g. registering streams
   * from a real source (or `useMockStreams(configs)` from a story).
   *
   * Rendered before the visible chrome, so non-visual children stay
   * out of the layout flow.
   */
  children?: ReactNode;

  className?: string;
}

/**
 * Multi-modal playback shell. Composes the three
 * providers we always need — `PlaybackProvider`, `TrackProvider`,
 * `TilingProvider` — and the standard four-region layout:
 *
 *     ┌──────────── TilingHeader ────────────┐
 *     │  filename · add-tile · ← sidebar →    │
 *     ├──────┬───────────────────────┬───────┤
 *     │ left │     MosaicGrid        │ right │
 *     ├──────┴───────────────────────┴───────┤
 *     │       TimelineWithTracks             │
 *     └──────────────────────────────────────┘
 *
 * Pass the data via props (`tracks`, `defaultPinnedTrackIds`,
 * `initialTiles`); pass setup hooks via `children` (stream
 * registration, source seeding, anything else that needs the
 * providers in scope). Override the sidebars per app surface via
 * `leftSidebar` / `rightSidebar`.
 *
 *     <MultiModalPlayback
 *       fileName="…"
 *       tracks={TRACKS}
 *       defaultPinnedTrackIds={PINNED}
 *       initialTiles={INITIAL_TILES}
 *     >
 *       <RegisterMyStreams />
 *     </MultiModalPlayback>
 */
const MultiModalPlayback: React.FC<MultiModalPlaybackProps> = ({
  fileName,
  headerCaption,
  headerActions,
  addTileMenu,
  timelineExtraActions,
  tracks,
  defaultPinnedTrackIds,
  initialTiles,
  initialManualTileTitles,
  autoLayoutStrategy,
  initialLayout,
  initialExpandedTileId,
  sceneSources = EMPTY_SOURCES,
  sharedImageWebGpuViews = false,
  deselectFocusedTileOnRepeatSelect = true,
  leftSidebar = <TileSettingsSidebar />,
  rightSidebar = <TilingInspectorSidebar />,
  defaultLeftOpen = true,
  defaultRightOpen = true,
  onLeftOpenChange,
  onRightOpenChange,
  leftSidebarWidth,
  onLeftSidebarWidthChange,
  onTagCreate,
  onTagDelete,
  children,
  className,
}) => {
  return (
    <PlaybackProvider>
      <TrackProvider tracks={tracks} initialPinnedIds={defaultPinnedTrackIds}>
        <SceneInventoryProvider sources={sceneSources}>
          <TilingProvider
            initialTiles={initialTiles}
            initialManualTileTitles={initialManualTileTitles}
            autoLayoutStrategy={autoLayoutStrategy}
            initialLayout={initialLayout}
            initialExpandedTileId={initialExpandedTileId}
          >
            {children}
            <Layout
              fileName={fileName}
              headerCaption={headerCaption}
              headerActions={headerActions}
              addTileMenu={addTileMenu}
              timelineExtraActions={timelineExtraActions}
              leftSidebar={leftSidebar}
              rightSidebar={rightSidebar}
              deselectFocusedTileOnRepeatSelect={
                deselectFocusedTileOnRepeatSelect
              }
              defaultLeftOpen={defaultLeftOpen}
              defaultRightOpen={defaultRightOpen}
              onLeftOpenChange={onLeftOpenChange}
              onRightOpenChange={onRightOpenChange}
              leftSidebarWidth={leftSidebarWidth}
              onLeftSidebarWidthChange={onLeftSidebarWidthChange}
              onTagCreate={onTagCreate}
              onTagDelete={onTagDelete}
              sharedImageWebGpuViews={sharedImageWebGpuViews}
              className={className}
            />
          </TilingProvider>
        </SceneInventoryProvider>
      </TrackProvider>
    </PlaybackProvider>
  );
};

interface LayoutProps {
  fileName: string;
  headerCaption?: TilingHeaderCaption;
  headerActions?: ReactNode;
  addTileMenu?: ReactNode;
  timelineExtraActions?: ReactNode;
  leftSidebar: ReactNode;
  rightSidebar: ReactNode;
  deselectFocusedTileOnRepeatSelect: boolean;
  defaultLeftOpen: boolean;
  defaultRightOpen: boolean;
  onLeftOpenChange?: (open: boolean) => void;
  onRightOpenChange?: (open: boolean) => void;
  leftSidebarWidth?: number;
  onLeftSidebarWidthChange?: (px: number) => void;
  onTagCreate?: MultiModalPlaybackProps["onTagCreate"];
  onTagDelete?: MultiModalPlaybackProps["onTagDelete"];
  sharedImageWebGpuViews: boolean;
  className?: string;
}

function Layout({
  fileName,
  headerCaption,
  headerActions,
  addTileMenu,
  timelineExtraActions,
  leftSidebar,
  rightSidebar,
  deselectFocusedTileOnRepeatSelect,
  defaultLeftOpen,
  defaultRightOpen,
  onLeftOpenChange,
  onRightOpenChange,
  leftSidebarWidth,
  onLeftSidebarWidthChange,
  onTagCreate,
  onTagDelete,
  sharedImageWebGpuViews,
  className,
}: LayoutProps) {
  const {
    layout,
    tiles,
    focusedTileId,
    setLayout,
    setFocusedTileId,
    splitTile,
    duplicateTile,
    closeOtherTiles,
    changeTileType,
    expandedTileId,
    setExpandedTileId,
  } = useTiling();
  // `null` (as opposed to undefined, which picks up the default sidebar)
  // removes the region outright: no drawer and no header toggle.
  const hasRightSidebar = rightSidebar !== null && rightSidebar !== undefined;
  const [leftOpen, setLeftOpen] = useState(defaultLeftOpen);
  const [rightOpen, setRightOpen] = useState(defaultRightOpen);
  // The Drawer has no size-seeding prop, but its open width always
  // resolves to `maxSize` (its content measurement saturates against the
  // full-height sidebar), so driving `maxSize` from state gives us both
  // restore and live drag-resize without forking voodo.
  const [leftWidth, setLeftWidth] = useState(() =>
    clampSidebarWidth(leftSidebarWidth ?? SIDEBAR_SIZE_PX),
  );
  const leftWidthRef = useRef(leftWidth);
  leftWidthRef.current = leftWidth;
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const updateLeftOpen = (open: boolean) => {
    setLeftOpen(open);
    onLeftOpenChange?.(open);
  };
  const updateRightOpen = (open: boolean) => {
    setRightOpen(open);
    onRightOpenChange?.(open);
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    // Primary button only: a right-click must not arm a drag that the
    // matching pointerup (suppressed by the context menu) never ends.
    if (event.button !== 0) return;
    // Suppress the compatibility mouse events so a drag can't start a
    // text selection in the sidebar it borders.
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startWidth: leftWidthRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setLeftWidth(
      clampSidebarWidth(drag.startWidth + event.clientX - drag.startX),
    );
  };
  const handleResizeEnd = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    onLeftSidebarWidthChange?.(leftWidthRef.current);
  };
  // Re-selecting the focused tile clears focus (toggle off); "action" reasons
  // (close/fullscreen) always focus without toggling.
  const handleFocusTile = useCallback(
    (id: string, reason: "select" | "action") => {
      const shouldDeselect =
        deselectFocusedTileOnRepeatSelect &&
        reason === "select" &&
        focusedTileId === id;
      setFocusedTileId(shouldDeselect ? null : id);
    },
    [deselectFocusedTileOnRepeatSelect, focusedTileId, setFocusedTileId],
  );

  const mosaic = (
    <MosaicGrid
      tiles={tiles}
      value={layout}
      onChange={setLayout}
      focusedTileId={focusedTileId}
      onFocusTile={handleFocusTile}
      onSplitTile={splitTile}
      onDuplicateTile={duplicateTile}
      onChangeTileType={changeTileType}
      onCloseOtherTiles={closeOtherTiles}
      expandedTileId={expandedTileId}
      onExpandedTileIdChange={setExpandedTileId}
      zeroStateView={<TilingZeroState addTileMenu={addTileMenu} />}
    />
  );

  return (
    <div className={clsx(styles.root, className)}>
      <TilingHeader
        fileName={fileName}
        headerCaption={headerCaption}
        headerActions={headerActions}
        addTileMenu={addTileMenu}
        leftSidebarOpen={leftOpen}
        rightSidebarOpen={rightOpen}
        onToggleLeftSidebar={() => updateLeftOpen(!leftOpen)}
        onToggleRightSidebar={
          hasRightSidebar ? () => updateRightOpen(!rightOpen) : undefined
        }
      />

      <div className={styles.body}>
        <Drawer
          side="left"
          mode="push"
          maxSize={leftWidth}
          open={leftOpen}
          onOpenChange={updateLeftOpen}
        >
          {/* Pinning the pane to the target width (instead of 100%) keeps
              the content from reflowing while the drawer's open/close
              animation sweeps the wrapper width. */}
          <div
            className={styles.sidebarPane}
            data-testid="left-sidebar-pane"
            style={{ width: leftWidth }}
          >
            {leftSidebar}
          </div>
          {/* Our clamped resize handle. It overlays the Drawer's built-in
              shrink-to-close strip (z-index 10) so pointer events land
              here instead. */}
          <div
            className={styles.resizeHandle}
            data-testid="sidebar-resize-handle"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
        </Drawer>

        <div className={styles.main}>
          {sharedImageWebGpuViews ? (
            <WebGpuViewStage className={styles.sharedViewStage}>
              {mosaic}
            </WebGpuViewStage>
          ) : (
            mosaic
          )}
        </div>

        {hasRightSidebar ? (
          <Drawer
            side="right"
            mode="push"
            maxSize={SIDEBAR_SIZE_PX}
            open={rightOpen}
            onOpenChange={updateRightOpen}
          >
            <div
              className={styles.sidebarPane}
              style={{ width: SIDEBAR_SIZE_PX }}
            >
              {rightSidebar}
            </div>
          </Drawer>
        ) : null}
      </div>

      <TemporalTagTimeline
        extraActions={timelineExtraActions}
        onTagCreate={onTagCreate}
        eventMenuItems={
          onTagDelete
            ? [
                {
                  label: "Delete tag",
                  destructive: true,
                  onSelect: onTagDelete,
                },
              ]
            : undefined
        }
      />
    </div>
  );
}

export default MultiModalPlayback;
