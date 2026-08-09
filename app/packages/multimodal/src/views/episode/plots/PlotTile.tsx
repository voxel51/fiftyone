import {
  getHoverTime,
  getPlayhead,
  setHoverTime,
  subscribeHoverTime,
  subscribePlayhead,
  usePlayback,
  usePlaybackStore,
} from "@fiftyone/playback";
import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useMemo } from "react";
import type { AlignedData } from "uplot";
import { addCoveredRange, type NsRange } from "../../../runtime";
import TimeseriesChart, {
  type TimeseriesCoverageRange,
  type TimeseriesChartSeries,
  type TimeseriesViewport,
} from "../../../visualization/plot/TimeseriesChart";
import { useDataStream } from "../playback/data-stream-context";
import {
  numericSeriesKey,
  useNumericSeriesContext,
  useNumericSeriesStates,
} from "./numeric-series-context";
import {
  plotSeriesDisplayName,
  plotTileDisplayTitle,
} from "./plot-series-display";
import { usePlotTileSeries } from "./plot-tile-state";
import type { EpisodeTileProps } from "../tiles/tile-types";
import { joinNumericSeries } from "./numeric-series-join";
import plotStyles from "./PlotTile.module.css";
import PlotTileSettings from "./PlotTileSettings";
import { useRegisterTileSettings } from "../tiles/tile-settings-context";
import styles from "../tiles/Tile.module.css";

/**
 * Numeric plot tile: charts enabled stream+field series against the recording
 * timeline with a playback-synced playhead and click-to-seek. The bridge loads
 * the follow or pinned viewport on demand; exact shading keeps unread source
 * spans distinct from decoded no-data gaps and unavailable source units.
 */
const PlotTile: React.FC<EpisodeTileProps> = () => {
  const tileId = useTileId();
  // Settings render through the sidebar's tile-settings registry, not here.
  const settingsRegistration = useMemo(
    () => ({ content: <PlotTileSettings /> }),
    [],
  );
  useRegisterTileSettings(tileId, settingsRegistration);
  const seriesConfigs = usePlotTileSeries();
  const setTileTitle = useSetTileTitle();
  const { ensureEnumeration, enumeration, setViewportDemand, subscribeSeries } =
    useNumericSeriesContext();
  const seriesKeys = useMemo(
    () =>
      seriesConfigs.map((config) =>
        numericSeriesKey(config.stream, config.fieldPath),
      ),
    [seriesConfigs],
  );
  const seriesByKey = useNumericSeriesStates(seriesKeys);
  const sourceNamesByBinding = useMemo(() => {
    const names = new Map<string, string>();
    for (const stream of enumeration.streams) {
      names.set(stream.streamId, stream.sourceName);
      names.set(stream.sourceName, stream.sourceName);
    }
    return names;
  }, [enumeration.streams]);
  const dataStream = useDataStream();
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const durationSec = timeline?.durationSec ?? 0;
  const { seek, settleSeek } = usePlayback();
  const store = usePlaybackStore();

  // This effect kicks the plottable-field enumeration for the settings
  // sidebar the first time any plot tile exists.
  useEffect(() => {
    ensureEnumeration();
  }, [ensureEnumeration]);

  // This effect keeps the tile chrome aligned with the selected plot series.
  useEffect(() => {
    setTileTitle(plotTileDisplayTitle(seriesConfigs, sourceNamesByBinding), {
      source: "auto",
    });
  }, [seriesConfigs, setTileTitle, sourceNamesByBinding]);

  // This effect declares interest in every enabled series while the tile
  // shows it; the bridge fetches follow/pinned viewports for interested
  // signals and retains immutable tiles within its source-local budget.
  useEffect(() => {
    const unsubscribes = seriesConfigs.map((config) =>
      subscribeSeries(config.stream, config.fieldPath),
    );
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [seriesConfigs, subscribeSeries]);

  const resolved = useMemo(
    () =>
      seriesConfigs.map((config) => ({
        config,
        state: seriesByKey.get(
          numericSeriesKey(config.stream, config.fieldPath),
        ),
      })),
    [seriesByKey, seriesConfigs],
  );

  const ready = useMemo(() => {
    const out: {
      readonly color: string;
      readonly label: string;
      readonly timesSec: Float64Array;
      readonly values: Float64Array;
    }[] = [];
    for (const entry of resolved) {
      if (
        entry.state?.status === "ready" &&
        entry.state.timesSec &&
        entry.state.values
      ) {
        out.push({
          color: entry.config.color,
          label: plotSeriesDisplayName(entry.config, sourceNamesByBinding),
          timesSec: entry.state.timesSec,
          values: entry.state.values,
        });
      }
    }
    return out;
  }, [resolved, sourceNamesByBinding]);

  const chartSeries: readonly TimeseriesChartSeries[] = useMemo(
    () => ready.map((entry) => ({ color: entry.color, label: entry.label })),
    [ready],
  );

  const chartData: AlignedData = useMemo(() => {
    const joined = joinNumericSeries(ready);
    return [joined.xs, ...joined.ys] as AlignedData;
  }, [ready]);
  const coverageRanges = useMemo(
    () =>
      timeline
        ? intersectCoverage(
            resolved.map((entry) => entry.state?.coverage ?? []),
          ).map((range) => ({
            endSec: Number(range.endNs - timeline.startTimeNs) / 1e9,
            startSec: Number(range.startNs - timeline.startTimeNs) / 1e9,
          }))
        : [],
    [resolved, timeline],
  );
  const unavailableRanges = useMemo<TimeseriesCoverageRange[]>(
    () =>
      timeline
        ? unionCoverage(
            resolved.flatMap((entry) => entry.state?.unavailable ?? []),
          ).map((range) => ({
            endSec: Number(range.endNs - timeline.startTimeNs) / 1e9,
            startSec: Number(range.startNs - timeline.startTimeNs) / 1e9,
          }))
        : [],
    [resolved, timeline],
  );
  const onViewportChange = useCallback(
    (viewport: TimeseriesViewport) => {
      setViewportDemand(String(tileId), viewport);
    },
    [setViewportDemand, tileId],
  );

  // This effect removes pinned demand when the tile leaves the layout.
  useEffect(
    () => () => setViewportDemand(String(tileId), null),
    [setViewportDemand, tileId],
  );

  const registerPlayheadListener = useCallback(
    (listener: (sec: number) => void) => {
      listener(getPlayhead(store));
      return subscribePlayhead(store, () => listener(getPlayhead(store)));
    },
    [store],
  );

  // Two-way hover correlation: this plot publishes the time under its
  // pointer, and echoes the time any sibling surface (other plots, the
  // timeline ruler) is hovering.
  const onHoverTime = useCallback(
    (sec: number | null) => {
      setHoverTime(store, sec);
    },
    [store],
  );
  const registerHoverTimeListener = useCallback(
    (listener: (sec: number | null) => void) => {
      listener(getHoverTime(store));
      return subscribeHoverTime(store, () => listener(getHoverTime(store)));
    },
    [store],
  );

  const loadingCount = resolved.filter(
    (entry) => !entry.state || entry.state.status === "loading",
  ).length;
  const errorCount = resolved.filter(
    (entry) => entry.state?.status === "error",
  ).length;
  const truncated = resolved.some((entry) => entry.state?.truncated);
  const incompleteCoverage = resolved
    .map((entry) => entry.state)
    .filter(
      (
        state,
      ): state is NonNullable<typeof state> & {
        coverageSeconds: number;
        targetSeconds: number;
      } =>
        state?.coverageSeconds !== undefined &&
        state.targetSeconds !== undefined &&
        state.coverageSeconds + 0.001 < state.targetSeconds,
    )
    .sort((left, right) => left.coverageSeconds - right.coverageSeconds)[0];
  const statusNotes = [
    loadingCount > 0 ? `loading ${loadingCount}` : null,
    incompleteCoverage
      ? `loaded ${Math.floor(
          incompleteCoverage.coverageSeconds,
        )}s of visible ${Math.ceil(incompleteCoverage.targetSeconds)}s`
      : null,
    errorCount > 0 ? `${errorCount} failed` : null,
    truncated ? "partial" : null,
  ].filter(Boolean);

  return (
    <div className={plotStyles.body} data-testid="episode-plot-tile">
      {statusNotes.length > 0 ? (
        <span
          className={`${styles.statusBadge} ${
            errorCount > 0 ? styles.statusBadgeError : ""
          }`}
        >
          {statusNotes.join(" · ")}
        </span>
      ) : null}
      {seriesConfigs.length === 0 ? (
        <div className={styles.loading}>
          <span className={styles.emptyText}>
            Choose fields to plot in the panel settings
          </span>
        </div>
      ) : ready.length > 0 ? (
        <TimeseriesChart
          coverageRanges={coverageRanges}
          data={chartData}
          durationSec={durationSec}
          onHoverTime={onHoverTime}
          onSeek={seek}
          onSeekEnd={settleSeek}
          onViewportChange={onViewportChange}
          registerHoverTimeListener={registerHoverTimeListener}
          registerPlayheadListener={registerPlayheadListener}
          series={chartSeries}
          unavailableRanges={unavailableRanges}
        />
      ) : (
        <div className={styles.loading}>
          <span
            className={
              errorCount > 0 && loadingCount === 0
                ? styles.emptyTextError
                : styles.emptyText
            }
          >
            {errorCount > 0 && loadingCount === 0
              ? "Selected series failed to load"
              : "Loading series…"}
          </span>
        </div>
      )}
    </div>
  );
};

export default PlotTile;

function unionCoverage(ranges: readonly NsRange[]): NsRange[] {
  return ranges.reduce<NsRange[]>(addCoveredRange, []);
}

function intersectCoverage(
  rangeSets: readonly (readonly NsRange[])[],
): NsRange[] {
  if (rangeSets.length === 0) return [];
  let intersection = unionCoverage(rangeSets[0] ?? []);
  for (let setIndex = 1; setIndex < rangeSets.length; setIndex += 1) {
    const next = unionCoverage(rangeSets[setIndex] ?? []);
    const out: NsRange[] = [];
    let left = 0;
    let right = 0;
    while (left < intersection.length && right < next.length) {
      const leftRange = intersection[left];
      const rightRange = next[right];
      const startNs =
        leftRange.startNs > rightRange.startNs
          ? leftRange.startNs
          : rightRange.startNs;
      const endNs =
        leftRange.endNs < rightRange.endNs ? leftRange.endNs : rightRange.endNs;
      if (endNs >= startNs) out.push({ endNs, startNs });
      if (leftRange.endNs < rightRange.endNs) left += 1;
      else right += 1;
    }
    intersection = out;
    if (intersection.length === 0) break;
  }
  return intersection;
}
