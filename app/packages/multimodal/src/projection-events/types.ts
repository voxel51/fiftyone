import type { LoadStatus } from "../load-status";

/** Load state for projection-event React hooks. */
export type ProjectionEventsStatus = LoadStatus;

/**
 * A single occurrence of a projection event, as produced by the
 * multimodal events-grain ingestion. Timestamps are raw int64 wall-clock
 * nanoseconds carried as `bigint` — the JSON transport encodes them as
 * decimal strings because these values exceed `Number.MAX_SAFE_INTEGER`.
 *
 * The backend does not merge contiguous occurrences: one logical event
 * (e.g. `pedestrian_fast`) arrives as many short rows sharing `id`. The
 * timeline groups by `id` into a single track.
 */
export interface ProjectionEvent {
  /** Stable event identifier — the grouping key (e.g. `pedestrian_fast`). */
  readonly id: string;
  /** Human-readable label (e.g. "Fast pedestrian encounter"). */
  readonly name: string;
  /** Occurrence start, raw int64 wall-clock nanoseconds. */
  readonly startTimestampNs: bigint;
  /** Occurrence end, raw int64 wall-clock nanoseconds. */
  readonly endTimestampNs: bigint;
  /** Episode (sample) this occurrence belongs to. */
  readonly episodeId: string;
}

/**
 * Server-side filter for an episode's events. All fields optional; a
 * `projection` of `undefined` means "all events-grain projections".
 */
export interface ProjectionEventFilter {
  /** Restrict to one projection; omit for all events-grain projections. */
  readonly projection?: string;
  /** Inclusive lower bound on occurrence time, int64 ns. */
  readonly startNs?: bigint;
  /** Inclusive upper bound on occurrence time, int64 ns. */
  readonly stopNs?: bigint;
  /** Restrict to specific event ids. */
  readonly eventIds?: readonly string[];
}

/** Request for listing an episode's projection events. */
export interface ListEpisodeProjectionEventsRequest {
  readonly datasetId: string;
  readonly episodeId: string;
  readonly filter?: ProjectionEventFilter;
}

/**
 * Client for the (read-only) projection-events route surface. Events are
 * read-only for M1 — mutation semantics are deferred — so there is no
 * create/update/delete here, unlike the temporal-tags client.
 */
export interface ProjectionEventsClient {
  listEpisodeProjectionEvents(
    request: ListEpisodeProjectionEventsRequest,
  ): Promise<readonly ProjectionEvent[]>;
}

/** Hook options for episode-scoped projection-event loading. */
export interface UseEpisodeProjectionEventsOptions {
  readonly client?: ProjectionEventsClient;
  readonly datasetId?: string;
  readonly episodeId?: string;
  readonly filter?: ProjectionEventFilter;
}

/** Hook result for episode-scoped projection-event loading. */
export interface UseEpisodeProjectionEventsResult {
  readonly error: string | null;
  readonly status: ProjectionEventsStatus;
  readonly events: readonly ProjectionEvent[];
  readonly reload: () => Promise<readonly ProjectionEvent[]>;
}
