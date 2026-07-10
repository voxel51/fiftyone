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
