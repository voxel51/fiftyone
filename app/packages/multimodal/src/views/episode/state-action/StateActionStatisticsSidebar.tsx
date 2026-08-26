import { usePlayback } from "@fiftyone/playback/runtime";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useState } from "react";
import type {
  StateActionDimensionExtreme,
  StateActionEpisodeProfile,
  StateActionFeatureProfile,
  StateActionFeatureSchema,
  StateActionFeatureStats,
  StateActionStats,
  StateActionTimingProfile,
} from "../../../ports";
import { useDataStream } from "../playback/data-stream-context";
import { SettingsSelect } from "../settings/controls/SettingsSelect";
import {
  useHasStateActionProvider,
  useStateActionContext,
} from "./state-action-context";
import {
  STATE_ACTION_STATS_SCOPES,
  stateActionStatsScopeAtom,
  type StateActionStatsScope,
} from "./state-action-display";
import {
  formatEpisodeTime,
  formatStateActionValue,
} from "./state-action-format";
import styles from "./StateActionStatisticsSidebar.module.css";

/**
 * "Statistics" sidebar tab for state/action sessions. A persisted scope
 * chooses what the per-dimension tables show: the dataset-declared
 * statistics (`meta/stats.json`), this episode's computed numbers with
 * seekable extremes, or both layered together. Episode-computed facts —
 * recorded cadence, out-of-declared-range counts, action-vs-state
 * tracking error — ride along whenever the episode is in scope. Renders
 * nothing for sessions without the state/action capability.
 */
const StateActionStatisticsSidebar: React.FC = () => {
  // Compositions without the provider (isolated renders) simply show
  // nothing rather than requiring the state/action stack.
  const hasProvider = useHasStateActionProvider();
  return hasProvider ? <ProvidedStatistics /> : null;
};

const ProvidedStatistics: React.FC = () => {
  const { ensureSchema, readDimensionStats, readEpisodeProfile, schema } =
    useStateActionContext();
  const [stats, setStats] = useState<StateActionStats | null | "loading">(
    "loading",
  );
  const [profile, setProfile] = useState<StateActionEpisodeProfile | null>(
    null,
  );
  const [scope, setScope] = useAtom(stateActionStatsScopeAtom);
  const { pause, seek } = usePlayback();
  const dataStream = useDataStream();
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const originNs = timeline?.startTimeNs ?? 0n;
  const seekToNs = useCallback(
    (timestampNs: bigint) => {
      const index = dataStream?.getTimelineIndex();
      if (!index) return;
      pause();
      seek(index.nsToSec(timestampNs));
    },
    [dataStream, pause, seek],
  );

  // This passive effect (re)publishes the schema in case a shell remount
  // wiped the bridge's initial publication before this panel opened.
  useEffect(() => {
    ensureSchema();
  }, [ensureSchema]);

  const facts = schema.status === "ready" ? schema.schema : null;

  // This effect fetches the source-declared statistics once per session
  // schema; the capability caches, so re-opens of this tab cost nothing.
  useEffect(() => {
    if (!facts) return undefined;
    const controller = new AbortController();
    setStats("loading");
    readDimensionStats(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setStats(result);
      },
      () => {
        if (!controller.signal.aborted) setStats(null);
      },
    );
    return () => controller.abort();
  }, [facts, readDimensionStats]);

  // This effect kicks off the episode profile scan; the capability caches
  // it for the session, and everything below renders without it until the
  // scan lands.
  useEffect(() => {
    if (!facts) return undefined;
    const controller = new AbortController();
    setProfile(null);
    readEpisodeProfile(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setProfile(result);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [facts, readEpisodeProfile]);

  if (!facts) return null;

  const resolvedStats = stats === "loading" ? null : stats;
  const rowsFact = `${facts.rowCount.toLocaleString()} rows this episode`;
  const showEpisode = scope !== "dataset";
  return (
    <div className={styles.root} data-testid="episode-state-action-summary">
      <label className={styles.scopeRow}>
        <span className={styles.scopeLabel}>Scope</span>
        <SettingsSelect
          ariaLabel="Statistics scope"
          onChange={(next) => setScope(next as StateActionStatsScope)}
          options={STATE_ACTION_STATS_SCOPES}
          value={scope}
        />
      </label>
      <span className={styles.caption}>
        {captionText(scope, rowsFact, stats, resolvedStats)}
      </span>
      {showEpisode && profile ? (
        <TimingLine
          onSeek={seekToNs}
          originNs={originNs}
          timing={profile.timing}
        />
      ) : null}
      {facts.state ? (
        <FeatureStatistics
          feature={facts.state}
          onSeek={seekToNs}
          originNs={originNs}
          profile={showEpisode ? (profile?.state ?? null) : null}
          scope={scope}
          stats={resolvedStats?.state ?? null}
        />
      ) : null}
      {facts.action ? (
        <FeatureStatistics
          feature={facts.action}
          onSeek={seekToNs}
          originNs={originNs}
          profile={showEpisode ? (profile?.action ?? null) : null}
          scope={scope}
          stats={resolvedStats?.action ?? null}
        />
      ) : null}
      {showEpisode && profile?.trackingError ? (
        <TrackingErrorTable
          dimensions={(facts.state ?? facts.action)?.dimensions ?? []}
          trackingError={profile.trackingError}
        />
      ) : null}
    </div>
  );
};

function captionText(
  scope: StateActionStatsScope,
  rowsFact: string,
  stats: StateActionStats | null | "loading",
  resolvedStats: StateActionStats | null,
): string {
  if (scope === "episode") {
    return `${rowsFact} · statistics computed from this episode's rows. Click a min or max to seek to its frame; bars show where the episode sits in the declared range.`;
  }
  if (resolvedStats) {
    const across = resolvedStats.sampleCount
      ? ` across ${resolvedStats.sampleCount.toLocaleString()} frames`
      : "";
    return scope === "dataset"
      ? `${rowsFact} · dataset-declared statistics (meta/stats.json)${across}. Bars span declared min–max with the q01–q99 band and mean tick.`
      : `${rowsFact} · dataset-declared statistics (meta/stats.json)${across}. Bars span declared min–max with the q01–q99 band and mean tick; the bright strip is this episode's range.`;
  }
  return stats === "loading"
    ? `${rowsFact} · reading declared statistics…`
    : `${rowsFact} · this source declares no statistics (meta/stats.json).`;
}

/**
 * Recorded-cadence line: the episode's median sampling rate plus any
 * irregular inter-row gaps, with a jump to where the largest gap ends.
 * Dropped or delayed frames quietly poison policy training; this line is
 * where they stop being quiet.
 */
function TimingLine({
  onSeek,
  originNs,
  timing,
}: {
  readonly onSeek: (timestampNs: bigint) => void;
  readonly originNs: bigint;
  readonly timing: StateActionTimingProfile;
}) {
  if (timing.medianIntervalNs <= 0n) return null;
  const rateHz = 1e9 / Number(timing.medianIntervalNs);
  const rate = rateHz >= 10 ? rateHz.toFixed(0) : rateHz.toFixed(1);
  const largest = timing.gaps[0];
  return (
    <div className={styles.timingLine} data-testid="episode-timing-line">
      <span>
        {`Recorded cadence ${rate} Hz · ${
          timing.gapCount === 0
            ? "steady"
            : `${timing.gapCount} irregular ${
                timing.gapCount === 1 ? "gap" : "gaps"
              }`
        }`}
      </span>
      {largest ? (
        <button
          className={styles.seekButton}
          onClick={() => onSeek(largest.timestampNs)}
          title={`Largest gap follows frame ${largest.beforeFrameIndex} — click to seek to where rows resume (${formatEpisodeTime(largest.timestampNs, originNs)})`}
          type="button"
        >
          {`largest ${formatGapSeconds(largest.durationNs)}s`}
        </button>
      ) : null}
    </div>
  );
}

function FeatureStatistics({
  feature,
  onSeek,
  originNs,
  profile,
  scope,
  stats,
}: {
  readonly feature: StateActionFeatureSchema;
  readonly onSeek: (timestampNs: bigint) => void;
  readonly originNs: bigint;
  readonly profile: StateActionFeatureProfile | null;
  readonly scope: StateActionStatsScope;
  readonly stats: StateActionFeatureStats | null;
}) {
  return (
    <div className={styles.feature}>
      <div className={styles.featureHeading}>
        <span>{feature.featureName}</span>
        <span className={styles.featureSchema}>
          {`${feature.dtype} [${feature.shape.join(",")}]`}
        </span>
      </div>
      <div
        aria-label={`${feature.featureName} ${
          scope === "episode" ? "episode" : "declared"
        } statistics`}
        role="table"
      >
        <div className={styles.statRow} role="row">
          <span className={styles.statHeader} role="columnheader">
            Dimension
          </span>
          <span className={styles.statHeaderValue} role="columnheader">
            Min
          </span>
          <span className={styles.statHeaderValue} role="columnheader">
            Mean
          </span>
          <span className={styles.statHeaderValue} role="columnheader">
            Max
          </span>
        </div>
        <div role="rowgroup">
          {feature.dimensions.map((dimension) => (
            <DimensionRow
              dimension={dimension}
              key={dimension.index}
              onSeek={onSeek}
              originNs={originNs}
              profile={profile}
              scope={scope}
              stats={stats}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DimensionRow({
  dimension,
  onSeek,
  originNs,
  profile,
  scope,
  stats,
}: {
  readonly dimension: StateActionFeatureSchema["dimensions"][number];
  readonly onSeek: (timestampNs: bigint) => void;
  readonly originNs: bigint;
  readonly profile: StateActionFeatureProfile | null;
  readonly scope: StateActionStatsScope;
  readonly stats: StateActionFeatureStats | null;
}) {
  const index = dimension.index;
  const name = dimension.name ?? `[${index}]`;
  const min = stats?.min?.[index];
  const max = stats?.max?.[index];
  const mean = stats?.mean?.[index];
  const episodeMin = profile?.min[index] ?? null;
  const episodeMax = profile?.max[index] ?? null;
  const episodeMean = profile?.mean[index] ?? null;
  const outOfRange = profile?.outOfRangeCounts?.[index] ?? null;
  const detail = [
    stat("q01", stats?.q01?.[index]),
    stat("q50", stats?.q50?.[index]),
    stat("q99", stats?.q99?.[index]),
    stat("std", stats?.std?.[index]),
  ]
    .filter((entry): entry is string => entry !== null)
    .join(" · ");
  const outOfRangeNote =
    outOfRange !== null && outOfRange > 0 ? (
      <span
        className={styles.episodeOutOfRange}
        title="Rows whose value falls outside the declared min–max"
      >
        {`· ${outOfRange.toLocaleString()} outside declared`}
      </span>
    ) : null;
  return (
    <div className={styles.dimBlock} role="row" title={detail || undefined}>
      <div className={styles.statRow}>
        <span className={styles.statName} role="rowheader" title={name}>
          {name}
        </span>
        {scope === "episode" ? (
          // Episode scope puts this episode's numbers in the table itself,
          // and its min/max cells are the seek affordance.
          <>
            <SeekableStatCell
              extreme={episodeMin}
              kind="minimum"
              name={name}
              onSeek={onSeek}
              originNs={originNs}
            />
            <StatCell value={episodeMean ?? undefined} />
            <SeekableStatCell
              extreme={episodeMax}
              kind="maximum"
              name={name}
              onSeek={onSeek}
              originNs={originNs}
            />
          </>
        ) : (
          <>
            <StatCell value={min} />
            <StatCell value={mean} />
            <StatCell value={max} />
          </>
        )}
      </div>
      <RangeBar
        episodeMax={scope === "dataset" ? undefined : episodeMax?.value}
        episodeMin={scope === "dataset" ? undefined : episodeMin?.value}
        max={max}
        mean={mean}
        min={min}
        q01={stats?.q01?.[index]}
        q99={stats?.q99?.[index]}
      />
      {scope === "both" && episodeMin && episodeMax ? (
        <div className={styles.episodeLine}>
          <span className={styles.episodeLabel}>episode</span>
          <ExtremeSeekButton
            extreme={episodeMin}
            kind="minimum"
            name={name}
            onSeek={onSeek}
            originNs={originNs}
          />
          <span aria-hidden>…</span>
          <ExtremeSeekButton
            extreme={episodeMax}
            kind="maximum"
            name={name}
            onSeek={onSeek}
            originNs={originNs}
          />
          {outOfRangeNote}
        </div>
      ) : scope === "episode" && outOfRangeNote ? (
        <div className={styles.episodeLine}>{outOfRangeNote}</div>
      ) : null}
    </div>
  );
}

/** Right-aligned table cell whose content seeks to an episode extreme. */
function SeekableStatCell({
  extreme,
  kind,
  name,
  onSeek,
  originNs,
}: {
  readonly extreme: StateActionDimensionExtreme | null;
  readonly kind: "maximum" | "minimum";
  readonly name: string;
  readonly onSeek: (timestampNs: bigint) => void;
  readonly originNs: bigint;
}) {
  if (!extreme) {
    return (
      <span className={styles.statMissing} role="cell">
        —
      </span>
    );
  }
  return (
    <span className={styles.statSeekCell} role="cell">
      <ExtremeSeekButton
        extreme={extreme}
        kind={kind}
        name={name}
        onSeek={onSeek}
        originNs={originNs}
      />
    </span>
  );
}

/** Compact seekable episode extreme: click jumps the playhead to its row. */
function ExtremeSeekButton({
  extreme,
  kind,
  name,
  onSeek,
  originNs,
}: {
  readonly extreme: StateActionDimensionExtreme;
  readonly kind: "maximum" | "minimum";
  readonly name: string;
  readonly onSeek: (timestampNs: bigint) => void;
  readonly originNs: bigint;
}) {
  return (
    <button
      aria-label={`Seek to ${name} episode ${kind} (frame ${extreme.frameIndex})`}
      className={styles.seekButton}
      onClick={() => onSeek(extreme.timestampNs)}
      title={`Episode ${kind} at frame ${extreme.frameIndex} (${formatEpisodeTime(extreme.timestampNs, originNs)}) — click to seek`}
      type="button"
    >
      {formatStateActionValue(extreme.value).text}
    </button>
  );
}

/**
 * Per-dimension distribution strip on the dimension's own [min, max]
 * domain: the shaded band covers q01–q99, the tick marks the mean, and
 * the bright strip spans this episode's observed range. A narrow band
 * against a wide range flags rare extremes; an episode strip hugging one
 * edge flags an atypical episode.
 */
function RangeBar({
  episodeMax,
  episodeMin,
  max,
  mean,
  min,
  q01,
  q99,
}: {
  readonly episodeMax?: number;
  readonly episodeMin?: number;
  readonly max?: number;
  readonly mean?: number;
  readonly min?: number;
  readonly q01?: number;
  readonly q99?: number;
}) {
  if (
    min === undefined ||
    max === undefined ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max <= min
  ) {
    return null;
  }
  const position = (value: number) =>
    Math.min(1, Math.max(0, (value - min) / (max - min)));
  const bandStart = q01 !== undefined ? position(q01) : 0;
  const bandEnd = q99 !== undefined ? position(q99) : 1;
  const episodeStart =
    episodeMin !== undefined && Number.isFinite(episodeMin)
      ? position(episodeMin)
      : null;
  const episodeEnd =
    episodeMax !== undefined && Number.isFinite(episodeMax)
      ? position(episodeMax)
      : null;
  return (
    <div aria-hidden className={styles.rangeBar}>
      <div
        className={styles.rangeBand}
        style={{
          left: `${bandStart * 100}%`,
          width: `${Math.max(1, (bandEnd - bandStart) * 100)}%`,
        }}
      />
      {episodeStart !== null && episodeEnd !== null ? (
        <div
          className={styles.rangeEpisode}
          style={{
            left: `${episodeStart * 100}%`,
            width: `${Math.max(1, (episodeEnd - episodeStart) * 100)}%`,
          }}
        />
      ) : null}
      {mean !== undefined && Number.isFinite(mean) ? (
        <div
          className={styles.rangeMean}
          style={{ left: `${position(mean) * 100}%` }}
        />
      ) : null}
    </div>
  );
}

/**
 * Mean |action − state| per dimension over this episode. Action is the
 * command, state is the measurement; a joint that cannot follow its
 * command shows up here before it shows up in a training curve.
 */
function TrackingErrorTable({
  dimensions,
  trackingError,
}: {
  readonly dimensions: StateActionFeatureSchema["dimensions"];
  readonly trackingError: readonly (number | null)[];
}) {
  return (
    <div className={styles.feature}>
      <div className={styles.featureHeading}>
        <span>Tracking error</span>
        <span className={styles.featureSchema}>
          mean |action − state| · this episode
        </span>
      </div>
      <div aria-label="Tracking error" role="table">
        <div role="rowgroup">
          {trackingError.map((value, index) => {
            const name = dimensions[index]?.name ?? `[${index}]`;
            return (
              <div className={styles.trackingRow} key={index} role="row">
                <span className={styles.statName} role="rowheader" title={name}>
                  {name}
                </span>
                <StatCell value={value ?? undefined} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCell({ value }: { readonly value?: number }) {
  if (value === undefined) {
    return (
      <span className={styles.statMissing} role="cell">
        —
      </span>
    );
  }
  const formatted = formatStateActionValue(value);
  return (
    <span className={styles.statValue} role="cell" title={formatted.exact}>
      {formatted.text}
    </span>
  );
}

function stat(label: string, value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return `${label} ${formatStateActionValue(value).text}`;
}

function formatGapSeconds(durationNs: bigint): string {
  return (Number(durationNs) / 1e9).toFixed(2);
}

export default StateActionStatisticsSidebar;
