import {
  Tile,
  TileIdScope,
  TilingProvider,
  useSetTileSourceFor,
} from "@fiftyone/tiling";
import React, { useEffect } from "react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { TrackProvider } from "../../lib/TrackProvider";
import { useMockStreams, type MockStreamConfig } from "./use-mock-streams";

const TILE_ID = "story-tile";

/**
 * Wraps a single per-tile story in the full provider stack
 * (`PlaybackProvider` + `TrackProvider` + `TilingProvider`) and registers
 * one mock stream. The bound tile id is fixed (`story-tile`) and pre-set
 * to the stream's id so `useStream` / `useTileSource` / `useTileSettings`
 * inside the tile body resolve to real data instead of placeholders.
 *
 * Per-tile stories should pass their tile body as `children`; the
 * standard chrome (header + bordered content) wraps it automatically.
 */
export interface TileStoryProps {
  /** Stream config registered for the duration of the story. */
  config: MockStreamConfig;
  /** Title rendered in the tile header. */
  title: string;
  /** Width × height of the tile container. */
  width?: number;
  height?: number;
  /** The tile body (e.g. `<CameraTile />`). */
  children: React.ReactNode;
}

const TileStory: React.FC<TileStoryProps> = ({
  config,
  title,
  width = 480,
  height = 270,
  children,
}) => (
  <PlaybackProvider>
    <TrackProvider>
      <TilingProvider>
        <Inner config={config} title={title} width={width} height={height}>
          {children}
        </Inner>
      </TilingProvider>
    </TrackProvider>
  </PlaybackProvider>
);

const Inner: React.FC<TileStoryProps> = ({
  config,
  title,
  width,
  height,
  children,
}) => {
  useMockStreams([config]);
  const setTileSource = useSetTileSourceFor();
  useEffect(() => {
    setTileSource(TILE_ID, config.id);
  }, [setTileSource, config.id]);

  return (
    <TileIdScope tileId={TILE_ID}>
      <div style={{ width, height }}>
        <Tile
          title={title}
          onClose={() => {}}
          onFullscreen={() => {}}
        >
          {children}
        </Tile>
      </div>
    </TileIdScope>
  );
};

export default TileStory;
