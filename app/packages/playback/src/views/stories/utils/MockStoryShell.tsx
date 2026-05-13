import { useStore } from "jotai";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { tileSourceAtom } from "../../../lib/playback/atoms";
import {
  TilingProvider,
  type TilingTile,
} from "../../../lib/TilingProvider";
import { TrackProvider, type Track } from "../../../lib/TrackProvider";
import { DEFAULT_STREAM_CONFIGS } from "./default-stream-configs";
import {
  DEFAULT_PINNED_TRACK_IDS,
  DEFAULT_TRACKS,
} from "./default-tracks";
import type { MockStreamBundle } from "./types";
import { useMockStreams, type MockStreamConfig } from "./use-mock-streams";

interface MockStoryContextValue {
  bundles: MockStreamBundle[];
}

const MockStoryContext = createContext<MockStoryContextValue | null>(null);

/**
 * Read the mock-stream bundles registered by the surrounding
 * `MockStoryShell`. Throws when called outside one — that almost always
 * means the story forgot to wrap its body, so failing loud is better
 * than silently rendering with no data.
 */
export function useMockBundles(): MockStreamBundle[] {
  const ctx = useContext(MockStoryContext);
  if (!ctx) {
    throw new Error("useMockBundles must be used inside <MockStoryShell>");
  }
  return ctx.bundles;
}

/**
 * Build a `TilingTile` from a stream bundle. Exported so add-tile
 * handlers in story bodies can spawn additional tiles for the same
 * stream without having to know the bundle's internals.
 */
export function tileFromBundle(bundle: MockStreamBundle): TilingTile {
  const TileComponent = bundle.Tile;
  return {
    title: bundle.title,
    render: () => <TileComponent />,
  };
}

export interface MockStoryShellProps {
  /**
   * Stream configs to build, register, and turn into initial tiles.
   * Defaults to {@link DEFAULT_STREAM_CONFIGS} — a full multi-modal
   * mix so demos pick up sane data without specifying anything.
   */
  configs?: MockStreamConfig[];
  /**
   * Semantic tracks broadcast through the surrounding `TrackProvider`.
   * Defaults to {@link DEFAULT_TRACKS}.
   */
  tracks?: Track[];
  /** Which of the tracks start pinned to the timeline. */
  pinnedTrackIds?: string[];
  children: ReactNode;
}

/**
 * Story setup helper that owns the per-demo provider boilerplate:
 *
 *  1. Calls `useMockStreams(configs)` to build the bundles and register
 *     each stream with the surrounding `PlaybackProvider`.
 *  2. Derives an `initialTiles` map — one tile per registered stream,
 *     id `<streamId>-1` so subsequent `addTile` calls produce `-2`, …
 *  3. Mounts a `TilingProvider` seeded with that map.
 *  4. Publishes the bundles via context so descendants can read them
 *     through `useMockBundles()`.
 *
 * Expected usage (the `PlaybackProvider` deliberately has no
 * `duration` / `stepInterval` props — both are derived from the
 * registered streams):
 *
 *     <PlaybackProvider>
 *       <MockStoryShell configs={CONFIGS}>
 *         <YourDemoBody />
 *       </MockStoryShell>
 *     </PlaybackProvider>
 */
export function MockStoryShell({
  configs = DEFAULT_STREAM_CONFIGS,
  tracks = DEFAULT_TRACKS,
  pinnedTrackIds = DEFAULT_PINNED_TRACK_IDS,
  children,
}: MockStoryShellProps) {
  const bundles = useMockStreams(configs);
  const store = useStore();

  const initialTiles = useMemo<Record<string, TilingTile>>(
    () =>
      Object.fromEntries(
        bundles.map((bundle) => [`${bundle.id}-1`, tileFromBundle(bundle)])
      ),
    [bundles]
  );

  // Bind each seeded tile to its corresponding stream id. Tile bodies
  // read this from `tileSourceAtom(tileId)` via `useTileSource()`, so
  // the initial layout has data flowing without any per-story setup.
  useEffect(() => {
    for (const bundle of bundles) {
      store.set(tileSourceAtom(`${bundle.id}-1`), bundle.id);
    }
  }, [bundles, store]);

  const value = useMemo(() => ({ bundles }), [bundles]);

  return (
    <MockStoryContext.Provider value={value}>
      <TrackProvider initialTracks={tracks} initialPinnedIds={pinnedTrackIds}>
        <TilingProvider initialTiles={initialTiles}>{children}</TilingProvider>
      </TrackProvider>
    </MockStoryContext.Provider>
  );
}
