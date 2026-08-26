import React, { useEffect, useState } from "react";
import type {
  StateActionFeatureSchema,
  StateActionFeatureStats,
  StateActionStats,
} from "../../../ports";
import {
  useHasStateActionProvider,
  useStateActionContext,
} from "./state-action-context";
import { formatStateActionValue } from "./state-action-format";
import styles from "./StateActionStatisticsSidebar.module.css";

/**
 * "Statistics" sidebar tab for state/action sessions: the source-declared
 * per-dimension statistics (`meta/stats.json`) beside the declared names,
 * so an exact row value in the tile can be read against the ranges the
 * dataset itself reports. Everything shown is dataset-level source truth —
 * nothing here is computed from the episode. Renders nothing for sessions
 * without the state/action capability.
 */
const StateActionStatisticsSidebar: React.FC = () => {
  // Compositions without the provider (isolated renders) simply show
  // nothing rather than requiring the state/action stack.
  const hasProvider = useHasStateActionProvider();
  return hasProvider ? <ProvidedStatistics /> : null;
};

const ProvidedStatistics: React.FC = () => {
  const { ensureSchema, readDimensionStats, schema } = useStateActionContext();
  const [stats, setStats] = useState<StateActionStats | null | "loading">(
    "loading",
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

  if (!facts) return null;

  const resolvedStats = stats === "loading" ? null : stats;
  return (
    <div className={styles.root} data-testid="episode-state-action-summary">
      <div className={styles.title}>
        <span>State &amp; Action</span>
        <span className={styles.titleBadge}>
          {`${facts.rowCount.toLocaleString()} rows this episode`}
        </span>
      </div>
      <span className={styles.caption}>
        {resolvedStats
          ? `Dataset-declared statistics (meta/stats.json)${
              resolvedStats.sampleCount
                ? ` across ${resolvedStats.sampleCount.toLocaleString()} frames`
                : ""
            }. Bars span min–max; the band covers q01–q99 and the tick marks
            the mean.`
          : stats === "loading"
            ? "Reading declared statistics…"
            : "This source declares no statistics (meta/stats.json)."}
      </span>
      {facts.state ? (
        <FeatureStatistics
          feature={facts.state}
          stats={resolvedStats?.state ?? null}
        />
      ) : null}
      {facts.action ? (
        <FeatureStatistics
          feature={facts.action}
          stats={resolvedStats?.action ?? null}
        />
      ) : null}
    </div>
  );
};

function FeatureStatistics({
  feature,
  stats,
}: {
  readonly feature: StateActionFeatureSchema;
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
        aria-label={`${feature.featureName} declared statistics`}
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
  stats,
}: {
  readonly dimension: StateActionFeatureSchema["dimensions"][number];
  readonly stats: StateActionFeatureStats | null;
}) {
  const index = dimension.index;
  const name = dimension.name ?? `[${index}]`;
  const min = stats?.min?.[index];
  const max = stats?.max?.[index];
  const mean = stats?.mean?.[index];
  const detail = [
    stat("q01", stats?.q01?.[index]),
    stat("q50", stats?.q50?.[index]),
    stat("q99", stats?.q99?.[index]),
    stat("std", stats?.std?.[index]),
  ]
    .filter((entry): entry is string => entry !== null)
    .join(" · ");
  return (
    <div className={styles.dimBlock} role="row" title={detail || undefined}>
      <div className={styles.statRow}>
        <span className={styles.statName} role="rowheader" title={name}>
          {name}
        </span>
        <StatCell value={min} />
        <StatCell value={mean} />
        <StatCell value={max} />
      </div>
      <RangeBar
        max={max}
        mean={mean}
        min={min}
        q01={stats?.q01?.[index]}
        q99={stats?.q99?.[index]}
      />
    </div>
  );
}

/**
 * Per-dimension distribution strip on the dimension's own [min, max]
 * domain: the shaded band covers q01–q99 and the tick marks the mean. A
 * narrow band against a wide range flags rare extremes — exactly what
 * quantile-normalized training pipelines need to notice.
 */
function RangeBar({
  max,
  mean,
  min,
  q01,
  q99,
}: {
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
  return (
    <div aria-hidden className={styles.rangeBar}>
      <div
        className={styles.rangeBand}
        style={{
          left: `${bandStart * 100}%`,
          width: `${Math.max(1, (bandEnd - bandStart) * 100)}%`,
        }}
      />
      {mean !== undefined && Number.isFinite(mean) ? (
        <div
          className={styles.rangeMean}
          style={{ left: `${position(mean) * 100}%` }}
        />
      ) : null}
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

export default StateActionStatisticsSidebar;
