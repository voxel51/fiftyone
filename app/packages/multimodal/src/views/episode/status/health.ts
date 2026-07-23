/**
 * Unified per-stream health model for the episode modal: one notice shape for
 * everything the tile chrome and the 3D scene chip surface, the copy that
 * fills it, and the stabilizer that keeps boundary oscillation from
 * blinking notices in and out during playback.
 *
 * Severity/id catalog:
 *
 * | id                             | severity | scope | trigger |
 * |--------------------------------|----------|-------|---------|
 * | `placement:provisional`        | info     | scene | clouds rendered as a source-frame preview while positioning transforms load |
 * | `placement:pending-annotations`| info     | scene | annotation boxes hidden while their transforms load |
 * | `placement:pending-grids`      | info     | scene | map/grid layers hidden while their transforms load |
 * | `placement:pending-frustums`   | info     | scene | camera frustums hidden while their transforms load |
 * | `transform:failed`             | error    | scene | frame-transform window fetch failed |
 * | `transform:missing:<source>`   | warning  | scene | no transform path to the world frame; affected source hidden |
 * | `transform:stale`              | warning  | scene | latest recorded pose held past its freshness threshold |
 * | `camera:target-unavailable`    | warning  | scene | follow tracking enabled but the target transform is missing |
 * | `render:sampled`               | warning  | scene | point clouds exceed the display cap and render sampled |
 * | `stream:loading`               | info     | tile  | a stream is buffering at the playhead |
 * | `stream:gap`                   | info     | tile  | the playhead is before a stream's first message |
 * | `stream:stale`                 | warning  | tile  | the displayed frame is older than the stale threshold |
 * | `stream:failed`                | error    | tile  | repeated fetch failures for a stream (sticky) |
 *
 * Link-level instrumentation is deliberately not part of this model.
 */

import { useEffect, useReducer, useRef } from "react";
import type { DecodedDiagnostic } from "../../../ir";
import type { StreamStatus } from "../playback/stream-status-state";

/** One visible source placed through a held transform past its stale threshold. */
export interface StalePoseUsage {
  readonly ageNs: bigint;
  readonly sourceFrameId: string;
  readonly sourceId: string;
  readonly sourceTimeNs: bigint;
  readonly staleAfterNs: bigint;
  readonly targetFrameId: string;
}

/** One visible source that has no resolvable path into the scene frame. */
export interface UnresolvedPoseUsage {
  readonly sourceFrameId: string;
  readonly sourceId: string;
  readonly targetFrameId: string;
}

export type TrackingMode = "free" | "heading" | "pose" | "position";
export type ReferenceSelectionSource = "auto-local" | "auto-stable" | "user";

export type HealthSeverity = "error" | "info" | "warning";
export type HealthScope = "scene" | "tile" | "stream";

/**
 * One user-visible health condition. Identity is `id`: a condition whose
 * affected frame list or measured duration changes over time is ONE notice
 * whose `detail` updates in place — never a remove+add. `message` stays
 * short and stable; volatile lists/durations belong in `detail`.
 */
export interface HealthNotice {
  readonly detail?: string;
  readonly id: string;
  readonly message: string;
  readonly scope: HealthScope;
  readonly severity: HealthSeverity;
  readonly streamId?: string;
}

/** Converts latest decoder diagnostics into stream-scoped health notices. */
export function buildCapabilityNotices(
  streams: readonly string[],
  diagnosticsByStream: readonly (readonly DecodedDiagnostic[])[],
): HealthNotice[] {
  return streams.flatMap((streamId, index) =>
    (diagnosticsByStream[index] ?? []).map((diagnostic) => ({
      id: `capability:${streamId}:${diagnostic.code}`,
      message: diagnostic.message,
      scope: "stream" as const,
      severity: diagnostic.severity,
      streamId,
    })),
  );
}

/** Explains when the scene is intentionally rendered in local coordinates. */
export function buildReferenceFrameNotices({
  omittedFrameIds,
  omittedSourceIds = [],
  referenceFrameId,
  source,
}: {
  readonly omittedFrameIds: readonly string[];
  readonly omittedSourceIds?: readonly string[];
  readonly referenceFrameId: string;
  readonly source: ReferenceSelectionSource;
}): HealthNotice[] {
  if (source !== "auto-local" || !referenceFrameId) return [];
  const details = [
    ...(omittedSourceIds.length > 0
      ? [`Omitted sources: ${boundedIdList(omittedSourceIds)}`]
      : []),
    ...(omittedFrameIds.length > 0
      ? [`No transform path to ${boundedIdList(omittedFrameIds)}`]
      : []),
  ];
  return [
    {
      ...(details.length > 0 ? { detail: details.join(". ") } : {}),
      id: "reference:local",
      message: `Showing ${referenceFrameId} in local coordinates`,
      scope: "scene",
      severity: "info",
    },
  ];
}

// ---------------------------------------------------------------------------
// 3D scene notices (rendered by the panel's collapsed diagnostics chip)
// ---------------------------------------------------------------------------

/**
 * Placement-loading notices: layers withheld (or previewed in their source
 * frame) while positioning transforms are still loading.
 */
export function buildScene3dPlacementNotices({
  pendingAnnotationFrameIds,
  pendingFrustumFrameIds,
  pendingGridFrameIds,
  provisionalFrameIds,
}: {
  readonly pendingAnnotationFrameIds: readonly string[];
  readonly pendingFrustumFrameIds: readonly string[];
  readonly pendingGridFrameIds: readonly string[];
  readonly provisionalFrameIds: readonly string[];
}): HealthNotice[] {
  const notices: HealthNotice[] = [];
  if (provisionalFrameIds.length > 0) {
    notices.push({
      detail: `Displaying source-frame preview for ${provisionalFrameIds.join(
        ", ",
      )}`,
      id: "placement:provisional",
      message: "Positioning transforms loading",
      scope: "scene",
      severity: "info",
    });
  }
  if (pendingAnnotationFrameIds.length > 0) {
    notices.push({
      detail: `Hiding boxes in ${pendingAnnotationFrameIds.join(", ")}`,
      id: "placement:pending-annotations",
      message: "Annotation transforms loading",
      scope: "scene",
      severity: "info",
    });
  }
  if (pendingGridFrameIds.length > 0) {
    notices.push({
      detail: `Hiding grids in ${pendingGridFrameIds.join(", ")}`,
      id: "placement:pending-grids",
      message: "Map layer transforms loading",
      scope: "scene",
      severity: "info",
    });
  }
  if (pendingFrustumFrameIds.length > 0) {
    notices.push({
      detail: `Hiding frustums in ${pendingFrustumFrameIds.join(", ")}`,
      id: "placement:pending-frustums",
      message: "Camera transforms loading",
      scope: "scene",
      severity: "info",
    });
  }

  return notices;
}

/**
 * Transform-resolution notices. A window fetch failure short-circuits the
 * per-frame conditions — nothing downstream of a failed fetch is
 * trustworthy enough to report on.
 */
export function buildScene3dTransformNotices({
  cameraFollowHeldPose,
  frameTransformsError,
  sourceLabelsById,
  stalePoseUsages,
  timelineStartTimeNs,
  unresolvedPoseUsages,
  worldFrameId,
}: {
  readonly cameraFollowHeldPose?: Omit<StalePoseUsage, "sourceId"> | null;
  readonly frameTransformsError: string | null;
  readonly sourceLabelsById?: ReadonlyMap<string, string>;
  readonly stalePoseUsages: readonly StalePoseUsage[];
  readonly timelineStartTimeNs?: bigint;
  readonly unresolvedPoseUsages: readonly UnresolvedPoseUsage[];
  readonly worldFrameId: string;
}): HealthNotice[] {
  if (frameTransformsError) {
    return [
      {
        detail: frameTransformsError,
        id: "transform:failed",
        message: "Frame transforms failed to load",
        scope: "scene",
        severity: "error",
      },
    ];
  }
  if (!worldFrameId) {
    return [];
  }

  const notices: HealthNotice[] = [];
  for (const unresolved of unresolvedPoseUsages) {
    const sourceLabel =
      sourceLabelsById?.get(unresolved.sourceId) ?? unresolved.sourceId;
    notices.push({
      detail: `No pose connects ${unresolved.sourceFrameId} to ${unresolved.targetFrameId} at this time.`,
      id: `transform:missing:${unresolved.sourceId}`,
      message: `Cannot place ${sourceLabel} in the scene`,
      scope: "scene",
      severity: "warning",
    });
  }

  if (stalePoseUsages.length > 0 || cameraFollowHeldPose) {
    const rankedUsages = [...stalePoseUsages].sort(compareStalePoseSeverity);
    const visibleUsages = rankedUsages.slice(0, 3);
    const usageDetails = visibleUsages.map((usage) => {
      const sourceLabel =
        sourceLabelsById?.get(usage.sourceId) ?? usage.sourceId;
      return `${sourceLabel} — using pose from ${formatPoseSourceTime(
        usage.sourceTimeNs,
        timelineStartTimeNs,
      )} (${formatNsDuration(usage.ageNs)} old)`;
    });
    const remaining = rankedUsages.length - visibleUsages.length;
    if (remaining > 0) {
      usageDetails.push(`+${remaining} more`);
    }
    if (cameraFollowHeldPose) {
      usageDetails.push(
        stalePoseUsages.length > 0
          ? "Camera follow is paused"
          : `Camera follow is paused — using pose from ${formatPoseSourceTime(
              cameraFollowHeldPose.sourceTimeNs,
              timelineStartTimeNs,
            )} (${formatNsDuration(cameraFollowHeldPose.ageNs)} old)`,
      );
    }

    notices.push({
      detail: `${usageDetails.join(". ")}. Placement may be inaccurate.`,
      id: "transform:stale",
      message: "Pose data is stale",
      scope: "scene",
      severity: "warning",
    });
  }

  return notices;
}

/**
 * Follow-mode camera warning: the camera cannot follow its target because
 * the target's transform to the world frame is missing. Null outside follow
 * modes, while resolution is merely pending, or before both frames are
 * selected.
 */
export function buildCameraTargetNotice({
  cameraTargetFrameId,
  cameraTargetStatus,
  trackingMode,
  worldFrameId,
}: {
  readonly cameraTargetFrameId: string;
  readonly cameraTargetStatus: "missing" | "pending" | "resolved";
  readonly trackingMode: TrackingMode;
  readonly worldFrameId: string;
}): HealthNotice | null {
  if (
    trackingMode === "free" ||
    cameraTargetStatus !== "missing" ||
    !cameraTargetFrameId ||
    !worldFrameId
  ) {
    return null;
  }

  return {
    detail: `${cameraTargetFrameId} to ${worldFrameId}`,
    id: "camera:target-unavailable",
    message: "Camera target transform unavailable",
    scope: "scene",
    severity: "warning",
  };
}

/**
 * Live point-cloud sampling summary: how many rendered clouds exceed the
 * display cap, and the largest finite point count among them.
 */
export interface PointCloudSamplingSummary {
  readonly largestFinitePointCount: number;
  readonly sampledCloudCount: number;
}

/**
 * Display-sampling notice: at least one rendered point cloud exceeds the
 * per-cloud render cap and is shown sampled. Null while every cloud renders
 * in full.
 */
export function buildPointCloudSamplingNotice(
  sampling: PointCloudSamplingSummary | null,
  maxRenderPoints: number,
): HealthNotice | null {
  if (!sampling || sampling.sampledCloudCount <= 0) {
    return null;
  }

  const detail =
    sampling.sampledCloudCount === 1
      ? `Showing ${maxRenderPoints.toLocaleString()} of ${sampling.largestFinitePointCount.toLocaleString()} points.`
      : `${sampling.sampledCloudCount.toLocaleString()} point clouds exceed the ${maxRenderPoints.toLocaleString()}-point display limit.`;

  return {
    detail,
    id: "render:sampled",
    message: "Point cloud sampled for display",
    scope: "scene",
    severity: "warning",
  };
}

function compareStalePoseSeverity(left: StalePoseUsage, right: StalePoseUsage) {
  const relativeAge =
    right.ageNs * left.staleAfterNs - left.ageNs * right.staleAfterNs;
  if (relativeAge !== 0n) {
    return relativeAge > 0n ? 1 : -1;
  }
  return left.sourceId.localeCompare(right.sourceId);
}

function formatNsDuration(value: bigint): string {
  const ms = Number(value) / 1_000_000;
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

function formatPoseSourceTime(
  sourceTimeNs: bigint,
  timelineStartTimeNs: bigint | undefined,
): string {
  const relativeTimeNs =
    timelineStartTimeNs === undefined
      ? sourceTimeNs
      : sourceTimeNs - timelineStartTimeNs;
  return formatSourceTime(Number(relativeTimeNs) / 1_000_000_000);
}

// ---------------------------------------------------------------------------
// Tile stream summary (corner badge + empty state)
// ---------------------------------------------------------------------------

/**
 * The tile badge's summary notice: the model carries the same byte-identical
 * copy the badge has always rendered, plus `status` for the badge's
 * `data-status`/spinner/error styling.
 */
export interface TileStreamNotice extends HealthNotice {
  readonly status: Exclude<StreamStatus, "ready">;
}

interface StatusSummary {
  /** Number of streams currently in `status`. */
  readonly affected: number;
  readonly status: Exclude<StreamStatus, "ready">;
  readonly total: number;
}

const STREAM_STATUS_SEVERITY: Record<
  Exclude<StreamStatus, "ready">,
  HealthSeverity
> = {
  failed: "error",
  gap: "info",
  loading: "info",
  stale: "warning",
};

/**
 * Worst non-ready status across the tile's streams, severity-ordered: a
 * sticky failure outranks transient buffering, which outranks a
 * pre-start gap, which outranks a stale-but-rendering frame. `null`
 * when every stream is current.
 */
function summarizeStatuses(
  statuses: readonly StreamStatus[],
): StatusSummary | null {
  for (const status of ["failed", "loading", "gap", "stale"] as const) {
    const affected = statuses.filter((s) => s === status).length;
    if (affected > 0) {
      return { affected, status, total: statuses.length };
    }
  }
  return null;
}

/** `(k/n)` suffix so a multi-source tile says how much of it is behind. */
function affectedSuffix({ affected, total }: StatusSummary): string {
  return total > 1 ? ` (${affected}/${total})` : "";
}

/**
 * Timeline seconds → `m:ss.cs` for "No data until" copy — the same
 * shape as the playhead readout, so sub-second starts don't collapse
 * into a nonsensical "until 0:00" while the playhead sits at 0:00.
 */
function formatStartTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const totalCs = Math.ceil(safe * 100);
  const m = Math.floor(totalCs / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Earliest known first-message time among the streams currently in
 * "gap", or null when none is known. With latest-at-or-before
 * selection, a gap means the playhead is before the stream's first
 * message — the earliest start is when the tile gets content.
 */
function earliestGapStartSec(
  statuses: readonly StreamStatus[],
  startTimes: readonly (number | null)[],
): number | null {
  let earliest: number | null = null;
  statuses.forEach((status, index) => {
    if (status !== "gap") return;
    const start = startTimes[index];
    if (start === null || start === undefined) return;
    if (earliest === null || start < earliest) earliest = start;
  });
  return earliest;
}

function gapCopy(startSec: number | null): string {
  return startSec !== null
    ? `No data until ${formatStartTime(startSec)}`
    : "No data at this time";
}

function formatStaleAge(ageNs: bigint): string {
  if (ageNs < 1_000_000_000n) {
    const ms = Number(ageNs / 1_000_000n);
    return `${Math.max(1, ms)}ms`;
  }

  const seconds = Number(ageNs) / 1_000_000_000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function oldestStaleObservation(
  statuses: readonly StreamStatus[],
  staleAges: readonly (bigint | null)[],
): { readonly ageNs: bigint; readonly index: number } | null {
  let oldest: { readonly ageNs: bigint; readonly index: number } | null = null;
  statuses.forEach((status, index) => {
    if (status !== "stale") return;
    const age = staleAges[index];
    if (age === null || age === undefined) return;
    if (oldest === null || age > oldest.ageNs) {
      oldest = { ageNs: age, index };
    }
  });
  return oldest;
}

function streamNoticeMessage(
  summary: StatusSummary,
  statuses: readonly StreamStatus[],
  startTimes: readonly (number | null)[],
  staleAges: readonly (bigint | null)[],
  contentTimes: readonly (number | null)[],
  streams: readonly string[],
): string {
  switch (summary.status) {
    case "loading":
      return `Buffering${affectedSuffix(summary)}`;
    case "gap":
      return `${gapCopy(
        earliestGapStartSec(statuses, startTimes),
      )}${affectedSuffix(summary)}`;
    case "stale": {
      const stale = oldestStaleObservation(statuses, staleAges);
      const ageCopy =
        stale === null ? "" : ` from ${formatStaleAge(stale.ageNs)} ago`;
      const sourceTime =
        stale === null ? null : (contentTimes[stale.index] ?? null);
      const sourceCopy =
        sourceTime === null ? "" : ` (source ${formatSourceTime(sourceTime)})`;
      return `Displaying stale frame${ageCopy}${sourceCopy}${affectedSuffix(summary)}`;
    }
    case "failed": {
      const failedStreams = streams.filter(
        (_stream, index) => statuses[index] === "failed",
      );
      return failedStreams.length > 0
        ? `Failed to load: ${boundedIdList(failedStreams, 3)}`
        : `Failed to load${affectedSuffix(summary)}`;
    }
  }
}

function boundedIdList(ids: readonly string[], limit = 8): string {
  const visible = ids.slice(0, limit).join(", ");
  const remaining = ids.length - limit;
  return remaining > 0 ? `${visible}, +${remaining} more` : visible;
}

/**
 * Summarizes per-stream playback statuses into the tile badge's notice, or
 * null when every stream is current. Copy is byte-identical to the badge's
 * historical strings — the badge is glanceable chrome and its wording is
 * pinned by tests.
 */
export function buildTileStreamNotice({
  contentTimes = [],
  staleAges,
  startTimes,
  statuses,
  streams = [],
}: {
  readonly contentTimes?: readonly (number | null)[];
  readonly staleAges: readonly (bigint | null)[];
  readonly startTimes: readonly (number | null)[];
  readonly statuses: readonly StreamStatus[];
  readonly streams?: readonly string[];
}): TileStreamNotice | null {
  const summary = summarizeStatuses(statuses);
  if (!summary) return null;

  return {
    id: `stream:${summary.status}`,
    message: streamNoticeMessage(
      summary,
      statuses,
      startTimes,
      staleAges,
      contentTimes,
      streams,
    ),
    scope: "tile",
    severity: STREAM_STATUS_SEVERITY[summary.status],
    status: summary.status,
  };
}

function formatSourceTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const totalCs = Math.round(safe * 100);
  const minutes = Math.floor(totalCs / 6000);
  const seconds = Math.floor((totalCs % 6000) / 100);
  const centiseconds = totalCs % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(
    centiseconds,
  ).padStart(2, "0")}`;
}

/**
 * What a contentless tile should show: an explicit failure once every stream
 * has failed, a spinner only while data is actually loading, otherwise the
 * gap message (with the stream's start time when it is known).
 */
export type TileEmptyStateModel =
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "gap"; readonly message: string }
  | { readonly kind: "loading" };

export function buildTileEmptyStateModel({
  startTimes,
  statuses,
}: {
  readonly startTimes: readonly (number | null)[];
  readonly statuses: readonly StreamStatus[];
}): TileEmptyStateModel {
  const allFailed =
    statuses.length > 0 && statuses.every((s) => s === "failed");
  if (allFailed) {
    return { kind: "failed", message: "Failed to load stream data" };
  }
  if (statuses.some((s) => s === "loading")) {
    return { kind: "loading" };
  }
  return {
    kind: "gap",
    message: gapCopy(earliestGapStartSec(statuses, startTimes)),
  };
}

// ---------------------------------------------------------------------------
// Stabilizer
// ---------------------------------------------------------------------------

/**
 * A notice must be continuously produced for this long before it becomes
 * visible. Transform resolution flips per playback tick around window
 * boundaries; anything that cannot hold for half a second is boundary
 * noise the user should never see.
 */
export const NOTICE_APPEARANCE_FLOOR_MS = 500;

/**
 * Once visible, a notice survives production dropouts up to this long.
 * Boundary oscillation flips conditions off for a tick or two (~16-100ms
 * at playback cadence); 300ms forgives several consecutive flips while
 * still retiring a genuinely cleared condition quickly. The same
 * forgiveness applies pre-visibility so an oscillating condition can
 * accumulate toward the appearance floor instead of resetting forever.
 */
export const NOTICE_DISAPPEAR_LINGER_MS = 300;

interface NoticeRecord {
  /** When the current production episode began. */
  episodeStartMs: number;
  /** Time of the last update() call in which the id was produced. */
  lastProducedMs: number;
  /** Latest produced content — updated in place, never resets timing. */
  notice: HealthNotice;
  /**
   * Whether the id was in the produced set at the most recent update().
   * Tracked explicitly rather than inferred from timestamps: two updates
   * can share one clock millisecond (sub-ms re-renders, fake clocks), and
   * an observed absence must register even then.
   */
  producedAtLastUpdate: boolean;
  visible: boolean;
}

export interface NoticeStabilizer {
  /**
   * Timestamp (same clock as `now`) of the next time-driven visibility
   * change — a pending notice crossing the appearance floor or a
   * no-longer-produced notice's linger expiring — or null when no
   * transition can happen without new input.
   */
  nextEvaluateAtMs(): number | null;
  /**
   * Feed the currently produced notices; returns the visible set. The
   * returned array is referentially stable: identity changes only when
   * the visible ids, their order, or their content change.
   */
  update(produced: readonly HealthNotice[]): readonly HealthNotice[];
}

const EMPTY_NOTICES: readonly HealthNotice[] = [];

/**
 * Pure stabilizer core. Semantics ("produced" = present in an `update`
 * call; absence between calls is unobservable and assumed unchanged):
 *
 * - An id's episode starts when it is first produced, and survives
 *   observed absences of up to `disappearLingerMs`. An observed absence
 *   longer than that ends the episode.
 * - The notice becomes visible once its episode is `appearanceFloorMs`
 *   old, and stays visible until the episode ends — so a condition
 *   oscillating around a boundary appears once and holds.
 * - Re-producing an id updates message/detail in place without touching
 *   episode timing.
 * - Output order is first-visible order, so rows never reorder under
 *   churn.
 */
export function createNoticeStabilizer({
  appearanceFloorMs = NOTICE_APPEARANCE_FLOOR_MS,
  disappearLingerMs = NOTICE_DISAPPEAR_LINGER_MS,
  now = Date.now,
}: {
  readonly appearanceFloorMs?: number;
  readonly disappearLingerMs?: number;
  /** Injectable clock so tests can drive time deterministically. */
  readonly now?: () => number;
} = {}): NoticeStabilizer {
  const records = new Map<string, NoticeRecord>();
  const visibleOrder: string[] = [];
  let lastOutput: readonly HealthNotice[] = EMPTY_NOTICES;

  function dropVisible(id: string): void {
    const index = visibleOrder.indexOf(id);
    if (index >= 0) {
      visibleOrder.splice(index, 1);
    }
  }

  function update(produced: readonly HealthNotice[]): readonly HealthNotice[] {
    const nowMs = now();
    const producedIds = new Set<string>();

    for (const notice of produced) {
      // Identity is by id: the first producer wins within one update.
      if (producedIds.has(notice.id)) continue;
      producedIds.add(notice.id);

      const record = records.get(notice.id);
      if (!record) {
        records.set(notice.id, {
          episodeStartMs: nowMs,
          lastProducedMs: nowMs,
          notice,
          producedAtLastUpdate: true,
          visible: false,
        });
        continue;
      }

      // Was the id absent at the previous update, and for longer than the
      // linger? Then the old episode already ended — this is a new one.
      // (If it was present at the previous update, the gap is just time
      // between observations — e.g. paused playback — not an absence.)
      if (
        !record.producedAtLastUpdate &&
        nowMs - record.lastProducedMs > disappearLingerMs
      ) {
        record.episodeStartMs = nowMs;
        record.visible = false;
        dropVisible(notice.id);
      }
      record.lastProducedMs = nowMs;
      record.notice = notice;
      record.producedAtLastUpdate = true;
    }

    for (const [id, record] of records) {
      if (producedIds.has(id)) continue;
      if (nowMs - record.lastProducedMs > disappearLingerMs) {
        records.delete(id);
        dropVisible(id);
        continue;
      }
      record.producedAtLastUpdate = false;
    }

    for (const [id, record] of records) {
      if (
        !record.visible &&
        nowMs - record.episodeStartMs >= appearanceFloorMs
      ) {
        record.visible = true;
        visibleOrder.push(id);
      }
    }

    const next = visibleOrder.map(
      (id) => (records.get(id) as NoticeRecord).notice,
    );
    if (!outputEquals(lastOutput, next)) {
      lastOutput = next;
    }
    return lastOutput;
  }

  function nextEvaluateAtMs(): number | null {
    let earliest: number | null = null;
    for (const record of records.values()) {
      let candidate: number | null = null;
      if (record.producedAtLastUpdate && !record.visible) {
        candidate = record.episodeStartMs + appearanceFloorMs;
      } else if (!record.producedAtLastUpdate && record.visible) {
        // +1 so a wake landing exactly on the boundary is already past
        // it: retirement requires a strictly-greater gap (a dropout of
        // exactly the linger is still forgiven).
        candidate = record.lastProducedMs + disappearLingerMs + 1;
      }
      if (candidate !== null && (earliest === null || candidate < earliest)) {
        earliest = candidate;
      }
    }
    return earliest;
  }

  return { nextEvaluateAtMs, update };
}

function outputEquals(
  a: readonly HealthNotice[],
  b: readonly HealthNotice[],
): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id ||
      left.message !== right.message ||
      left.detail !== right.detail ||
      left.severity !== right.severity ||
      left.scope !== right.scope ||
      left.streamId !== right.streamId
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Stabilizes a per-render stream of produced notices into the visible set.
 * Consumers re-render per playback tick; the returned array keeps its
 * identity while the visible content is unchanged, so downstream memos and
 * id-keyed rows don't churn.
 */
export function useStabilizedNotices(
  notices: readonly HealthNotice[],
): readonly HealthNotice[] {
  const stabilizerRef = useRef<NoticeStabilizer | null>(null);
  stabilizerRef.current ??= createNoticeStabilizer();
  const latestNoticesRef = useRef(notices);
  latestNoticesRef.current = notices;
  const [, reevaluate] = useReducer((version: number) => version + 1, 0);

  const stabilized = stabilizerRef.current.update(notices);

  // This effect schedules a wake at the stabilizer's next time-driven
  // visibility boundary (appearance-floor crossing or disappear-linger
  // expiry). Between renders the produced set is assumed unchanged, so the
  // wake re-feeds the latest notices — letting a pending notice appear and
  // a lingering one expire even when nothing else re-renders (e.g. paused
  // playback). No dependency array on purpose: every render may move the
  // next boundary, and rescheduling one timeout per render is cheap.
  useEffect(() => {
    const stabilizer = stabilizerRef.current;
    if (!stabilizer) return;
    const nextAt = stabilizer.nextEvaluateAtMs();
    if (nextAt === null) return;

    const timer = setTimeout(
      () => {
        stabilizer.update(latestNoticesRef.current);
        reevaluate();
      },
      Math.max(0, nextAt - Date.now()),
    );
    return () => clearTimeout(timer);
  });

  return stabilized;
}
