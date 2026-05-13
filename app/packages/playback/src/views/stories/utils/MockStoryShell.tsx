import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  TilingProvider,
  type TilingTile,
} from "../../../lib/TilingProvider";
import type { TimelineTrackConfig } from "../../TimelineWithTracks/TimelineWithTracks";
import { DEFAULT_STREAM_CONFIGS } from "./default-stream-configs";
import { tracksFromBundles } from "./track-utils";
import type { MockStreamBundle } from "./types";
import { useMockStreams, type MockStreamConfig } from "./use-mock-streams";

interface MockStoryContextValue {
  bundles: MockStreamBundle[];
  tracks: TimelineTrackConfig[];
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
 * Read the auto-derived timeline tracks (one per registered stream
 * bundle, full-duration, with sensible default coloring + event
 * markers). Stories that want bespoke tracks should bypass this and
 * pass a hand-written array directly into TimelineWithTracks.
 */
export function useMockTracks(): TimelineTrackConfig[] {
  const ctx = useContext(MockStoryContext);
  if (!ctx) {
    throw new Error("useMockTracks must be used inside <MockStoryShell>");
  }
  return ctx.tracks;
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
  children,
}: MockStoryShellProps) {
  const bundles = useMockStreams(configs);

  const initialTiles = useMemo<Record<string, TilingTile>>(
    () =>
      Object.fromEntries(
        bundles.map((bundle) => [`${bundle.id}-1`, tileFromBundle(bundle)])
      ),
    [bundles]
  );

  const tracks = useMemo(() => tracksFromBundles(bundles), [bundles]);

  const value = useMemo(() => ({ bundles, tracks }), [bundles, tracks]);

  return (
    <MockStoryContext.Provider value={value}>
      <TilingProvider initialTiles={initialTiles}>{children}</TilingProvider>
    </MockStoryContext.Provider>
  );
}
