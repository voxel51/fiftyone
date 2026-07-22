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
 * | `transform:missing`            | warning  | scene | no transform path to the world frame; layer dropped |
 * | `transform:clamped`            | info     | scene | nearest-sample transform used within the boundary clamp |
 * | `transform:large-gap`          | warning  | scene | interpolating across a gap wider than the warning threshold |
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
import type { EpisodeStreamStatus } from "../playback/episode-stream-status-state";

export interface EpisodeTransformGapWarning {
  readonly frameId: string;
  readonly gapNs: bigint;
}

export type EpisodeTrackingMode = "free" | "heading" | "pose" | "position";
export type EpisodeReferenceSelectionSource =
  | "auto-local"
  | "auto-stable"
  | "user";

export type EpisodeHealthSeverity = "error" | "info" | "warning";
export type EpisodeHealthScope = "scene" | "tile" | "stream";

/**
 * One user-visible health condition. Identity is `id`: a condition whose
 * affected frame list or measured duration changes over time is ONE notice
 * whose `detail` updates in place — never a remove+add. `message` stays
 * short and stable; volatile lists/durations belong in `detail`.
 */
export interface EpisodeHealthNotice {
  readonly detail?: string;
  readonly id: string;
  readonly message: string;
  readonly scope: EpisodeHealthScope;
  readonly severity: EpisodeHealthSeverity;
  readonly streamId?: string;
}

/** Converts latest decoder diagnostics into stream-scoped health notices. */
export function buildEpisodeCapabilityNotices(
  streams: readonly string[],
  diagnosticsByStream: readonly (readonly DecodedDiagnostic[])[],
): EpisodeHealthNotice[] {
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
export function buildEpisodeReferenceFrameNotices({
  omittedFrameIds,
  omittedSourceIds = [],
  referenceFrameId,
  source,
}: {
  readonly omittedFrameIds: readonly string[];
  readonly omittedSourceIds?: readonly string[];
  readonly referenceFrameId: string;
  readonly source: EpisodeReferenceSelectionSource;
}): EpisodeHealthNotice[] {
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
export function buildEpisode3dPlacementNotices({
  pendingAnnotationFrameIds,
  pendingFrustumFrameIds,
  pendingGridFrameIds,
  provisionalFrameIds,
}: {
  readonly pendingAnnotationFrameIds: readonly string[];
  readonly pendingFrustumFrameIds: readonly string[];
  readonly pendingGridFrameIds: readonly string[];
  readonly provisionalFrameIds: readonly string[];
}): EpisodeHealthNotice[] {
  const notices: EpisodeHealthNotice[] = [];
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
export function buildEpisode3dTransformNotices({
  clampedFrameIds,
  frameTransformsError,
  largeInterpolationGaps,
  unresolvedFrameIds,
  worldFrameId,
}: {
  readonly clampedFrameIds: readonly string[];
  readonly frameTransformsError: string | null;
  readonly largeInterpolationGaps: readonly EpisodeTransformGapWarning[];
  readonly unresolvedFrameIds: readonly string[];
  readonly worldFrameId: string;
}): EpisodeHealthNotice[] {
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

  const notices: EpisodeHealthNotice[] = [];
  if (unresolvedFrameIds.length > 0) {
    notices.push({
      detail: unresolvedFrameIds.join(", "),
      id: "transform:missing",
      message: `Missing transform to ${worldFrameId}`,
      scope: "scene",
      severity: "warning",
    });
  }
  if (clampedFrameIds.length > 0) {
    notices.push({
      detail: clampedFrameIds.join(", "),
      id: "transform:clamped",
      message: `Using boundary-clamped transform to ${worldFrameId}`,
      scope: "scene",
      severity: "info",
    });
  }
  if (largeInterpolationGaps.length > 0) {
    notices.push({
      detail: formatInterpolationGapWarnings(largeInterpolationGaps),
      id: "transform:large-gap",
      message: `Interpolating transform across large gap to ${worldFrameId}`,
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
export function buildEpisodeCameraTargetNotice({
  cameraTargetFrameId,
  cameraTargetStatus,
  trackingMode,
  worldFrameId,
}: {
  readonly cameraTargetFrameId: string;
  readonly cameraTargetStatus: "missing" | "pending" | "resolved";
  readonly trackingMode: EpisodeTrackingMode;
  readonly worldFrameId: string;
}): EpisodeHealthNotice | null {
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
export interface EpisodePointCloudSamplingSummary {
  readonly largestFinitePointCount: number;
  readonly sampledCloudCount: number;
}

/**
 * Display-sampling notice: at least one rendered point cloud exceeds the
 * per-cloud render cap and is shown sampled. Null while every cloud renders
 * in full.
 */
export function buildEpisodePointCloudSamplingNotice(
  sampling: EpisodePointCloudSamplingSummary | null,
  maxRenderPoints: number,
): EpisodeHealthNotice | null {
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

function formatInterpolationGapWarnings(
  gaps: readonly EpisodeTransformGapWarning[],
): string {
  return gaps
    .map(({ frameId, gapNs }) => `${frameId} (${formatNsDuration(gapNs)})`)
    .join(", ");
}

function formatNsDuration(value: bigint): string {
  const ms = Number(value) / 1_000_000;
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Tile stream summary (corner badge + empty state)
// ---------------------------------------------------------------------------

/**
 * The tile badge's summary notice: the model carries the same byte-identical
 * copy the badge has always rendered, plus `status` for the badge's
 * `data-status`/spinner/error styling.
 */
export interface EpisodeTileStreamNotice extends EpisodeHealthNotice {
  readonly status: Exclude<EpisodeStreamStatus, "ready">;
}

interface StatusSummary {
  /** Number of streams currently in `status`. */
  readonly affected: number;
  readonly status: Exclude<EpisodeStreamStatus, "ready">;
  readonly total: number;
}

const STREAM_STATUS_SEVERITY: Record<
  Exclude<EpisodeStreamStatus, "ready">,
  EpisodeHealthSeverity
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
  statuses: readonly EpisodeStreamStatus[],
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
  statuses: readonly EpisodeStreamStatus[],
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

function oldestStaleAgeNs(
  statuses: readonly EpisodeStreamStatus[],
  staleAges: readonly (bigint | null)[],
): bigint | null {
  let oldest: bigint | null = null;
  statuses.forEach((status, index) => {
    if (status !== "stale") return;
    const age = staleAges[index];
    if (age === null || age === undefined) return;
    if (oldest === null || age > oldest) oldest = age;
  });
  return oldest;
}

function streamNoticeMessage(
  summary: StatusSummary,
  statuses: readonly EpisodeStreamStatus[],
  startTimes: readonly (number | null)[],
  staleAges: readonly (bigint | null)[],
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
      const ageNs = oldestStaleAgeNs(statuses, staleAges);
      const ageCopy =
        ageNs === null ? "" : ` from ${formatStaleAge(ageNs)} ago`;
      return `Displaying stale frame${ageCopy}${affectedSuffix(summary)}`;
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
export function buildEpisodeTileStreamNotice({
  staleAges,
  startTimes,
  statuses,
  streams = [],
}: {
  readonly staleAges: readonly (bigint | null)[];
  readonly startTimes: readonly (number | null)[];
  readonly statuses: readonly EpisodeStreamStatus[];
  readonly streams?: readonly string[];
}): EpisodeTileStreamNotice | null {
  const summary = summarizeStatuses(statuses);
  if (!summary) return null;

  return {
    id: `stream:${summary.status}`,
    message: streamNoticeMessage(
      summary,
      statuses,
      startTimes,
      staleAges,
      streams,
    ),
    scope: "tile",
    severity: STREAM_STATUS_SEVERITY[summary.status],
    status: summary.status,
  };
}

/**
 * What a contentless tile should show: an explicit failure once every stream
 * has failed, a spinner only while data is actually loading, otherwise the
 * gap message (with the stream's start time when it is known).
 */
export type EpisodeTileEmptyStateModel =
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "gap"; readonly message: string }
  | { readonly kind: "loading" };

export function buildEpisodeTileEmptyStateModel({
  startTimes,
  statuses,
}: {
  readonly startTimes: readonly (number | null)[];
  readonly statuses: readonly EpisodeStreamStatus[];
}): EpisodeTileEmptyStateModel {
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
export const EPISODE_NOTICE_APPEARANCE_FLOOR_MS = 500;

/**
 * Once visible, a notice survives production dropouts up to this long.
 * Boundary oscillation flips conditions off for a tick or two (~16-100ms
 * at playback cadence); 300ms forgives several consecutive flips while
 * still retiring a genuinely cleared condition quickly. The same
 * forgiveness applies pre-visibility so an oscillating condition can
 * accumulate toward the appearance floor instead of resetting forever.
 */
export const EPISODE_NOTICE_DISAPPEAR_LINGER_MS = 300;

interface NoticeRecord {
  /** When the current production episode began. */
  episodeStartMs: number;
  /** Time of the last update() call in which the id was produced. */
  lastProducedMs: number;
  /** Latest produced content — updated in place, never resets timing. */
  notice: EpisodeHealthNotice;
  /**
   * Whether the id was in the produced set at the most recent update().
   * Tracked explicitly rather than inferred from timestamps: two updates
   * can share one clock millisecond (sub-ms re-renders, fake clocks), and
   * an observed absence must register even then.
   */
  producedAtLastUpdate: boolean;
  visible: boolean;
}

export interface EpisodeNoticeStabilizer {
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
  update(
    produced: readonly EpisodeHealthNotice[],
  ): readonly EpisodeHealthNotice[];
}

const EMPTY_NOTICES: readonly EpisodeHealthNotice[] = [];

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
export function createEpisodeNoticeStabilizer({
  appearanceFloorMs = EPISODE_NOTICE_APPEARANCE_FLOOR_MS,
  disappearLingerMs = EPISODE_NOTICE_DISAPPEAR_LINGER_MS,
  now = Date.now,
}: {
  readonly appearanceFloorMs?: number;
  readonly disappearLingerMs?: number;
  /** Injectable clock so tests can drive time deterministically. */
  readonly now?: () => number;
} = {}): EpisodeNoticeStabilizer {
  const records = new Map<string, NoticeRecord>();
  const visibleOrder: string[] = [];
  let lastOutput: readonly EpisodeHealthNotice[] = EMPTY_NOTICES;

  function dropVisible(id: string): void {
    const index = visibleOrder.indexOf(id);
    if (index >= 0) {
      visibleOrder.splice(index, 1);
    }
  }

  function update(
    produced: readonly EpisodeHealthNotice[],
  ): readonly EpisodeHealthNotice[] {
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
  a: readonly EpisodeHealthNotice[],
  b: readonly EpisodeHealthNotice[],
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
export function useStabilizedEpisodeNotices(
  notices: readonly EpisodeHealthNotice[],
): readonly EpisodeHealthNotice[] {
  const stabilizerRef = useRef<EpisodeNoticeStabilizer | null>(null);
  stabilizerRef.current ??= createEpisodeNoticeStabilizer();
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
