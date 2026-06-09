import {
  MosaicGrid,
  TileSettingsSidebar,
  TilingHeader,
  TilingInspectorSidebar,
  TilingProvider,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import { Drawer } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useState, type ReactNode } from "react";
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

export interface MultiModalPlaybackProps {
  /** Filename rendered on the left of the top bar. */
  fileName: string;

  /** Tracks broadcast through the embedded TrackProvider. */
  tracks?: Track[];
  /** Track ids that should start pinned to the timeline. */
  defaultPinnedTrackIds?: string[];

  /** Initial tile entries seeded into the embedded TilingProvider. */
  initialTiles?: Record<string, TilingTile>;

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
  tracks,
  defaultPinnedTrackIds,
  initialTiles,
  sceneSources = EMPTY_SOURCES,
  leftSidebar = <TileSettingsSidebar />,
  rightSidebar = <TilingInspectorSidebar />,
  defaultLeftOpen = true,
  defaultRightOpen = true,
  onTagCreate,
  onTagDelete,
  children,
  className,
}) => {
  return (
    <PlaybackProvider>
      <TrackProvider tracks={tracks} initialPinnedIds={defaultPinnedTrackIds}>
        <SceneInventoryProvider sources={sceneSources}>
          <TilingProvider initialTiles={initialTiles}>
            {children}
            <Layout
              fileName={fileName}
              leftSidebar={leftSidebar}
              rightSidebar={rightSidebar}
              defaultLeftOpen={defaultLeftOpen}
              defaultRightOpen={defaultRightOpen}
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
  leftSidebar: ReactNode;
  rightSidebar: ReactNode;
  defaultLeftOpen: boolean;
  defaultRightOpen: boolean;
  onTagCreate?: MultiModalPlaybackProps["onTagCreate"];
  onTagDelete?: MultiModalPlaybackProps["onTagDelete"];
  className?: string;
}

function Layout({
  fileName,
  leftSidebar,
  rightSidebar,
  defaultLeftOpen,
  defaultRightOpen,
  onTagCreate,
  onTagDelete,
  className,
}: LayoutProps) {
  const { layout, tiles, focusedTileId, setLayout, setFocusedTileId } =
    useTiling();
  const [leftOpen, setLeftOpen] = useState(defaultLeftOpen);
  const [rightOpen, setRightOpen] = useState(defaultRightOpen);

  return (
    <div className={clsx(styles.root, className)}>
      <TilingHeader
        fileName={fileName}
        leftSidebarOpen={leftOpen}
        rightSidebarOpen={rightOpen}
        onToggleLeftSidebar={() => setLeftOpen((v) => !v)}
        onToggleRightSidebar={() => setRightOpen((v) => !v)}
      />

      <div className={styles.body}>
        <Drawer
          side="left"
          mode="push"
          defaultSize={280}
          minSize={200}
          maxSize={500}
          open={leftOpen}
          onOpenChange={setLeftOpen}
        >
          {leftSidebar}
        </Drawer>

        <div className={styles.main}>
          <MosaicGrid
            tiles={tiles}
            value={layout}
            onChange={setLayout}
            focusedTileId={focusedTileId}
            onFocusTile={setFocusedTileId}
          />
        </div>

        <Drawer
          side="right"
          mode="push"
          defaultSize={280}
          minSize={200}
          maxSize={500}
          open={rightOpen}
          onOpenChange={setRightOpen}
        >
          {rightSidebar}
        </Drawer>
      </div>

      <TemporalTagTimeline onTagCreate={onTagCreate} onEventDelete={onTagDelete} />
    </div>
  );
}

export default MultiModalPlayback;
