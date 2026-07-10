import type {
  ListEpisodeProjectionEventsRequest,
  ProjectionEvent,
  ProjectionEventFilter,
  ProjectionEventsClient,
} from "./types";

const NS_PER_SECOND = 1_000_000_000;

/**
 * Builds `count` back-to-back occurrences of `chunkSec` each, starting at
 * `startSec`. Mirrors how the real events-grain ingestion emits a single
 * logical event as many short contiguous rows (it does not merge them);
 * the timeline groups them back into one track by `id`.
 */
function contiguous(
  id: string,
  name: string,
  startSec: number,
  count: number,
  chunkSec: number,
): Omit<ProjectionEvent, "episodeId">[] {
  const rows: Omit<ProjectionEvent, "episodeId">[] = [];
  for (let i = 0; i < count; i++) {
    const start = startSec + i * chunkSec;
    rows.push({
      id,
      name,
      startTimestampNs: BigInt(Math.round(start * NS_PER_SECOND)),
      endTimestampNs: BigInt(Math.round((start + chunkSec) * NS_PER_SECOND)),
    });
  }
  return rows;
}

/**
 * Canned events shaped like the nuscenes `derived_events` projection, in
 * **recording-relative** nanoseconds (0-based) so they land on the
 * timeline without knowing the recording's absolute start. The real API
 * returns absolute wall-clock ns; see the `originNs` rebasing in
 * `use-mcap-projection-events`.
 */
const MOCK_EVENTS: readonly Omit<ProjectionEvent, "episodeId">[] = [
  ...contiguous("pedestrian_fast", "Fast pedestrian encounter", 2.0, 5, 0.5),
  ...contiguous("pedestrian_fast", "Fast pedestrian encounter", 18.4, 3, 0.5),
  ...contiguous("high_steering", "High steering", 8.1, 1, 6.0),
  ...contiguous("high_steering", "High steering", 21.0, 1, 1.5),
  ...contiguous(
    "imu_acceleration_spike",
    "IMU acceleration spike",
    5.2,
    1,
    0.2,
  ),
  ...contiguous(
    "imu_acceleration_spike",
    "IMU acceleration spike",
    11.8,
    1,
    0.2,
  ),
  ...contiguous(
    "imu_acceleration_spike",
    "IMU acceleration spike",
    24.3,
    1,
    0.2,
  ),
];

/**
 * Catalog of demo event archetypes. The dynamic client picks a per-episode
 * subset so different samples surface different projection events.
 */
const EVENT_CATALOG: readonly (readonly [string, string])[] = [
  ["pedestrian_fast", "Fast pedestrian encounter"],
  ["high_steering", "High steering"],
  ["imu_acceleration_spike", "IMU acceleration spike"],
  ["hard_brake", "Hard brake"],
  ["lane_change", "Lane change"],
  ["cyclist_nearby", "Cyclist nearby"],
  ["traffic_light_stop", "Traffic light stop"],
  ["sharp_turn", "Sharp turn"],
  ["close_following", "Close following"],
  ["jaywalker", "Jaywalker detected"],
];

/** FNV-1a hash — a stable numeric seed from an episode id string. */
function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG (mulberry32) so an episode always renders the
 *  same events across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically generates a per-episode set of projection events: a
 * seeded subset of {@link EVENT_CATALOG}, each with a few randomly-timed
 * clusters of contiguous occurrence rows, all recording-relative (0-based).
 */
function generateEpisodeEvents(
  episodeId: string,
): Omit<ProjectionEvent, "episodeId">[] {
  const rng = mulberry32(hashString(episodeId));

  // Seeded Fisher-Yates shuffle of a catalog copy, then take a subset.
  const catalog = EVENT_CATALOG.map((entry) => entry);
  for (let i = catalog.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [catalog[i], catalog[j]] = [catalog[j], catalog[i]];
  }
  const typeCount = 2 + Math.floor(rng() * 4); // 2..5 event types

  const rows: Omit<ProjectionEvent, "episodeId">[] = [];
  for (const [id, name] of catalog.slice(0, typeCount)) {
    const clusters = 1 + Math.floor(rng() * 3); // 1..3 occurrences
    for (let c = 0; c < clusters; c++) {
      const startSec = 0.5 + rng() * 17; // within ~0.5..17.5s
      const count = 1 + Math.floor(rng() * 5); // 1..5 contiguous chunks
      const chunkSec = 0.2 + rng() * 0.6; // 0.2..0.8s each
      rows.push(...contiguous(id, name, startSec, count, chunkSec));
    }
  }
  return rows;
}

function passesFilter(
  event: ProjectionEvent,
  filter: ProjectionEventFilter | undefined,
): boolean {
  if (!filter) return true;
  if (filter.eventIds && !filter.eventIds.includes(event.id)) return false;
  // Overlap test against the [startNs, stopNs] window.
  if (filter.stopNs !== undefined && event.startTimestampNs > filter.stopNs) {
    return false;
  }
  if (filter.startNs !== undefined && event.endTimestampNs < filter.startNs) {
    return false;
  }
  return true;
}

/**
 * In-memory {@link ProjectionEventsClient} for development and stories
 * while the events-grain resolver + route are unbuilt. Echoes the
 * requested `episodeId` onto every row and honors the filter so it stands
 * in for a real endpoint.
 */
export function createMockProjectionEventsClient(
  events: readonly Omit<ProjectionEvent, "episodeId">[] = MOCK_EVENTS,
): ProjectionEventsClient {
  return {
    async listEpisodeProjectionEvents({
      episodeId,
      filter,
    }: ListEpisodeProjectionEventsRequest) {
      return events
        .map((event) => ({ ...event, episodeId }))
        .filter((event) => passesFilter(event, filter));
    },
  };
}

/**
 * Like {@link createMockProjectionEventsClient} but derives a distinct,
 * stable set of events per `episodeId` (see {@link generateEpisodeEvents}),
 * so different samples show different projection events in a demo instead of
 * all sharing one canned set.
 */
export function createDynamicMockProjectionEventsClient(): ProjectionEventsClient {
  return {
    async listEpisodeProjectionEvents({
      episodeId,
      filter,
    }: ListEpisodeProjectionEventsRequest) {
      return generateEpisodeEvents(episodeId)
        .map((event) => ({ ...event, episodeId }))
        .filter((event) => passesFilter(event, filter));
    },
  };
}
