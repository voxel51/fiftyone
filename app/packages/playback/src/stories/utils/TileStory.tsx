import { Tile, TileIdScope, TilingProvider } from "@fiftyone/tiling";
import React from "react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { TrackProvider } from "../../lib/tracks/TrackProvider";
import { useMockStreams, type MockStreamConfig } from "./use-mock-streams";

const TILE_ID = "story-tile";

/**
 * Wraps a single per-tile story in the full provider stack
 * (`PlaybackProvider` + `TrackProvider` + `TilingProvider`) and
 * registers one mock stream so the tile body's `useStream` resolves to
 * real data. The caller is responsible for passing the stream id to
 * its tile body (`config.id`) via the `children` slot.
 */
export interface TileStoryProps {
  /** Stream config registered for the duration of the story. */
  config: MockStreamConfig;
  /** Title rendered in the tile header. */
  title: string;
  /** Width × height of the tile container. */
  width?: number;
  height?: number;
  /** The tile body — typically `<CameraTile streamId={config.id} />`. */
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
  return (
    <TileIdScope tileId={TILE_ID}>
      <div style={{ width, height }}>
        <Tile title={title} onClose={() => {}} onFullscreen={() => {}}>
          {children}
        </Tile>
      </div>
    </TileIdScope>
  );
};

export default TileStory;
