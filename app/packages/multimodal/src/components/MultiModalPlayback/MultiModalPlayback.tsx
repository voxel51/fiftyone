import {
  MosaicGrid,
  TileSettingsSidebar,
  TilingHeader,
  TilingInspectorSidebar,
  TilingProvider,
  useTiling,
  type TilingHeaderCaption,
  type TilingTile,
} from "@fiftyone/tiling";
import { Drawer } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useCallback, useState, type ReactNode } from "react";
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
import styles from "./MultiModalPlayback.module.css";

const EMPTY_SOURCES: readonly SceneSource[] = [];
const SIDEBAR_SIZE_PX = 360;

export interface MultiModalPlaybackProps {
  /** Filename rendered on the left of the top bar. */
  fileName: string;
  /** Optional caption rendered below the filename in the top bar. */
  headerCaption?: TilingHeaderCaption;

  /** Tracks broadcast through the embedded TrackProvider. */
  tracks?: Track[];
  /** Track ids that should start pinned to the timeline. */
  defaultPinnedTrackIds?: string[];

  /** Initial tile entries seeded into the embedded TilingProvider. */
  initialTiles?: Record<string, TilingTile>;

  /**
   * Initial mosaic tree seeded into the embedded TilingProvider. Leave
   * `undefined` to auto-lay-out `initialTiles`; pass an explicit tree to
   * restore a saved arrangement.
   */
  initialLayout?: MosaicNode<string> | null;

  /** Discoverable data sources for the current scene. */
  sceneSources?: readonly SceneSource[];

  /**
   * Override for the left sidebar. Defaults to {@link TileSettingsSidebar}
   * (focused tile's settings).
   */
  leftSidebar?: ReactNode;
  /**
   * Override for the right sidebar. Defaults to {@link TilingInspectorSidebar}
   * (focused tile's selection payload as JSON).
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
   * Callback that persists a newly-created temporal tag.  When provided,
   * the temporal-tag workflow is enabled in the timeline (button, `T`
   * hotkey, Shift+drag).
   */
  onTagCreate?: TemporalTagTimelineProps["onTagCreate"];
  /** Callback that deletes an existing temporal tag by its backend id. */
  onTagDelete?: TemporalTagTimelineProps["onEventDelete"];

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
  tracks,
  defaultPinnedTrackIds,
  initialTiles,
  initialLayout,
  sceneSources = EMPTY_SOURCES,
  leftSidebar = <TileSettingsSidebar />,
  rightSidebar = <TilingInspectorSidebar />,
  defaultLeftOpen = true,
  defaultRightOpen = true,
  onLeftOpenChange,
  onRightOpenChange,
  onTagCreate,
  onTagDelete,
  children,
  className,
}) => {
  return (
    <PlaybackProvider>
      <TrackProvider
        initialTracks={tracks}
        initialPinnedIds={defaultPinnedTrackIds}
      >
        <SceneInventoryProvider sources={sceneSources}>
          <TilingProvider
            initialTiles={initialTiles}
            initialLayout={initialLayout}
          >
            {children}
            <Layout
              fileName={fileName}
              headerCaption={headerCaption}
              leftSidebar={leftSidebar}
              rightSidebar={rightSidebar}
              defaultLeftOpen={defaultLeftOpen}
              defaultRightOpen={defaultRightOpen}
              onLeftOpenChange={onLeftOpenChange}
              onRightOpenChange={onRightOpenChange}
              onTagCreate={onTagCreate}
              onTagDelete={onTagDelete}
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
  leftSidebar: ReactNode;
  rightSidebar: ReactNode;
  defaultLeftOpen: boolean;
  defaultRightOpen: boolean;
  onLeftOpenChange?: (open: boolean) => void;
  onRightOpenChange?: (open: boolean) => void;
  onTagCreate?: MultiModalPlaybackProps["onTagCreate"];
  onTagDelete?: MultiModalPlaybackProps["onTagDelete"];
  className?: string;
}

function Layout({
  fileName,
  headerCaption,
  leftSidebar,
  rightSidebar,
  defaultLeftOpen,
  defaultRightOpen,
  onLeftOpenChange,
  onRightOpenChange,
  onTagCreate,
  onTagDelete,
  className,
}: LayoutProps) {
  const { layout, tiles, focusedTileId, setLayout, setFocusedTileId } =
    useTiling();
  const [leftOpen, setLeftOpen] = useState(defaultLeftOpen);
  const [rightOpen, setRightOpen] = useState(defaultRightOpen);

  const updateLeftOpen = (open: boolean) => {
    setLeftOpen(open);
    onLeftOpenChange?.(open);
  };
  const updateRightOpen = (open: boolean) => {
    setRightOpen(open);
    onRightOpenChange?.(open);
  };
  // Re-selecting the focused tile clears focus (toggle off); "action" reasons
  // (close/fullscreen) always focus without toggling.
  const handleFocusTile = useCallback(
    (id: string, reason: "select" | "action") => {
      setFocusedTileId(reason === "select" && focusedTileId === id ? null : id);
    },
    [focusedTileId, setFocusedTileId]
  );

  return (
    <div className={clsx(styles.root, className)}>
      <TilingHeader
        fileName={fileName}
        headerCaption={headerCaption}
        leftSidebarOpen={leftOpen}
        rightSidebarOpen={rightOpen}
        onToggleLeftSidebar={() => updateLeftOpen(!leftOpen)}
        onToggleRightSidebar={() => updateRightOpen(!rightOpen)}
      />

      <div className={styles.body}>
        <Drawer
          side="left"
          mode="push"
          maxSize={SIDEBAR_SIZE_PX}
          open={leftOpen}
          onOpenChange={updateLeftOpen}
        >
          <div className={styles.sidebarPane}>{leftSidebar}</div>
        </Drawer>

        <div className={styles.main}>
          <MosaicGrid
            tiles={tiles}
            value={layout}
            onChange={setLayout}
            focusedTileId={focusedTileId}
            onFocusTile={handleFocusTile}
          />
        </div>

        <Drawer
          side="right"
          mode="push"
          maxSize={SIDEBAR_SIZE_PX}
          open={rightOpen}
          onOpenChange={updateRightOpen}
        >
          <div className={styles.sidebarPane}>{rightSidebar}</div>
        </Drawer>
      </div>

      <TemporalTagTimeline
        onTagCreate={onTagCreate}
        onEventDelete={onTagDelete}
      />
    </div>
  );
}

export default MultiModalPlayback;
