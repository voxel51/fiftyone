import { EpisodeCadenceTracker } from "../../runtime/temporal-policy";
import type { EpisodeLogConsoleRow } from "./log-console-rows";

export type DiagnosticFreshness = "current" | "stale" | "unknown";

/** Latest reported state and playback-relative freshness for one identity. */
export interface EpisodeDiagnosticState {
  readonly ageNs: bigint;
  readonly freshness: DiagnosticFreshness;
  readonly id: string;
  readonly row: EpisodeLogConsoleRow;
  readonly staleAfterNs: bigint;
}

export interface DiagnosticProjectionRequest {
  /** Changes whenever a seek invalidates previously held state. */
  readonly generation: string;
  readonly orderedEvents: readonly EpisodeLogConsoleRow[];
  readonly playheadTimeNs: bigint;
  /** A latest-at-or-before bootstrap for a discontinuous window. */
  readonly seedEvents: readonly EpisodeLogConsoleRow[];
  /** Whether source evidence is proven, still loading, or known incomplete. */
  readonly sourceCoverage: "complete" | "incomplete" | "pending";
}

/**
 * Incremental partial-upsert fold for ROS diagnostic arrays.
 *
 * The projector deliberately retains latest state when the raw log window
 * prunes older events. A generation change is the only reset boundary. When
 * the ordered cache is unchanged, Follow consumes only newly visible events.
 */
export class DiagnosticStateProjector {
  private readonly cadenceById = new Map<string, EpisodeCadenceTracker>();
  private coverageProven = true;
  private generation: string | undefined;
  private lastEvents: readonly EpisodeLogConsoleRow[] | undefined;
  private lastPlayheadTimeNs: bigint | undefined;
  private lastSeedEvents: readonly EpisodeLogConsoleRow[] | undefined;
  private readonly latestById = new Map<string, EpisodeLogConsoleRow>();

  project(
    request: DiagnosticProjectionRequest,
  ): readonly EpisodeDiagnosticState[] {
    if (request.generation !== this.generation) {
      this.reset(request.generation);
    }
    if (request.sourceCoverage === "incomplete") this.coverageProven = false;

    if (request.seedEvents !== this.lastSeedEvents) {
      this.consumeThrough(request.seedEvents, request.playheadTimeNs, 0);
      this.lastSeedEvents = request.seedEvents;
    }

    const canConsumeDelta =
      request.orderedEvents === this.lastEvents &&
      this.lastPlayheadTimeNs !== undefined &&
      request.playheadTimeNs >= this.lastPlayheadTimeNs;
    const startIndex = canConsumeDelta
      ? upperTimelineBound(
          request.orderedEvents,
          this.lastPlayheadTimeNs as bigint,
        )
      : 0;
    this.consumeThrough(
      request.orderedEvents,
      request.playheadTimeNs,
      startIndex,
    );
    this.lastEvents = request.orderedEvents;
    this.lastPlayheadTimeNs = request.playheadTimeNs;

    return this.materialize(
      request.playheadTimeNs,
      this.coverageProven && request.sourceCoverage === "complete",
    );
  }

  private consumeThrough(
    rows: readonly EpisodeLogConsoleRow[],
    playheadTimeNs: bigint,
    startIndex: number,
  ): void {
    for (let index = startIndex; index < rows.length; index += 1) {
      const row = rows[index] as EpisodeLogConsoleRow;
      if (row.timelineTimeNs > playheadTimeNs) break;
      if (row.kind !== "diagnostic" || !row.diagnosticId) continue;

      let cadence = this.cadenceById.get(row.diagnosticId);
      if (!cadence) {
        cadence = new EpisodeCadenceTracker();
        this.cadenceById.set(row.diagnosticId, cadence);
      }
      cadence.observe(row.timelineTimeNs);

      const current = this.latestById.get(row.diagnosticId);
      if (!current || compareDiagnosticEvents(current, row) < 0) {
        this.latestById.set(row.diagnosticId, row);
      }
    }
  }

  private materialize(
    playheadTimeNs: bigint,
    sourceCoverageComplete: boolean,
  ): readonly EpisodeDiagnosticState[] {
    const states: EpisodeDiagnosticState[] = [];
    for (const [id, row] of this.latestById) {
      const ageNs =
        playheadTimeNs > row.timelineTimeNs
          ? playheadTimeNs - row.timelineTimeNs
          : 0n;
      const staleAfterNs =
        this.cadenceById.get(id)?.observationStaleThresholdNs() ?? 0n;
      states.push({
        ageNs,
        freshness: !sourceCoverageComplete
          ? "unknown"
          : staleAfterNs > 0n && ageNs > staleAfterNs
            ? "stale"
            : "current",
        id,
        row,
        staleAfterNs,
      });
    }
    states.sort(compareDiagnosticStates);
    return states;
  }

  private reset(generation: string): void {
    this.cadenceById.clear();
    this.coverageProven = true;
    this.generation = generation;
    this.lastEvents = undefined;
    this.lastPlayheadTimeNs = undefined;
    this.lastSeedEvents = undefined;
    this.latestById.clear();
  }
}

function compareDiagnosticEvents(
  left: EpisodeLogConsoleRow,
  right: EpisodeLogConsoleRow,
): number {
  if (left.timelineTimeNs !== right.timelineTimeNs) {
    return left.timelineTimeNs < right.timelineTimeNs ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
}

function compareDiagnosticStates(
  left: EpisodeDiagnosticState,
  right: EpisodeDiagnosticState,
): number {
  const severity = severityRank(left.row) - severityRank(right.row);
  if (severity !== 0) return severity;
  if (left.freshness !== right.freshness) {
    if (left.freshness === "unknown") return -1;
    if (right.freshness === "unknown") return 1;
    if (left.freshness === "stale") return -1;
    if (right.freshness === "stale") return 1;
  }
  return (
    (left.row.groupLabel ?? left.row.stream).localeCompare(
      right.row.groupLabel ?? right.row.stream,
    ) || left.id.localeCompare(right.id)
  );
}

function severityRank(row: EpisodeLogConsoleRow): number {
  switch (row.level) {
    case "fatal":
    case "error":
      return 0;
    case "warn":
      return 1;
    case "unknown":
      return 2;
    case "info":
      return 3;
    case "debug":
      return 4;
  }
}

function upperTimelineBound(
  rows: readonly EpisodeLogConsoleRow[],
  timeNs: bigint,
): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if ((rows[middle] as EpisodeLogConsoleRow).timelineTimeNs <= timeNs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}
