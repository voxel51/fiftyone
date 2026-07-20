/** Aggregate counters exposed by the episode performance-stats panel. */
export interface EpisodeMapPerformanceStats {
  readonly followCommands: number;
  readonly playbackPaints: number;
  readonly reactCommits: {
    readonly surface: number;
    readonly tile: number;
  };
  readonly sourceUpdates: Readonly<Record<string, number>>;
  readonly totalSourceUpdates: number;
}

const MAX_SOURCE_UPDATE_ENTRIES = 64;
const sourceUpdates = new Map<string, number>();
let followCommands = 0;
let playbackPaints = 0;
let surfaceReactCommits = 0;
let tileReactCommits = 0;
let totalSourceUpdates = 0;

/** Records a continuous follow-camera command. */
export function noteEpisodeMapFollowCommand(): void {
  followCommands += 1;
}

/** Records one imperative playback frame painted into MapLibre. */
export function noteEpisodeMapPlaybackPaint(): void {
  playbackPaints += 1;
}

/** Records a React commit for either map component boundary. */
export function noteEpisodeMapReactCommit(surface: "tile" | "surface"): void {
  if (surface === "tile") tileReactCommits += 1;
  else surfaceReactCommits += 1;
}

/** Records a GeoJSON source update while bounding per-source diagnostics. */
export function noteEpisodeMapSourceUpdate(sourceId: string): void {
  totalSourceUpdates += 1;
  const count = sourceUpdates.get(sourceId) ?? 0;
  sourceUpdates.delete(sourceId);
  sourceUpdates.set(sourceId, count + 1);
  while (sourceUpdates.size > MAX_SOURCE_UPDATE_ENTRIES) {
    const oldest = sourceUpdates.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    sourceUpdates.delete(oldest);
  }
}

/** Returns a serializable snapshot of the cumulative map counters. */
export function episodeMapPerformanceStats(): EpisodeMapPerformanceStats {
  return {
    followCommands,
    playbackPaints,
    reactCommits: {
      surface: surfaceReactCommits,
      tile: tileReactCommits,
    },
    sourceUpdates: Object.fromEntries(sourceUpdates),
    totalSourceUpdates,
  };
}

/** Clears map counters between tests. */
export function resetEpisodeMapPerformanceStatsForTests(): void {
  followCommands = 0;
  playbackPaints = 0;
  surfaceReactCommits = 0;
  tileReactCommits = 0;
  totalSourceUpdates = 0;
  sourceUpdates.clear();
}
