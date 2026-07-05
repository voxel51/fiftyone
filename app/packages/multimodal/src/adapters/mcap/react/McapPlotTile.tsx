import {
  getHoverTime,
  getPlayhead,
  setHoverTime,
  subscribeHoverTime,
  subscribePlayhead,
  usePlayback,
  usePlaybackStore,
} from "@fiftyone/playback";
import React, { useCallback, useEffect, useMemo } from "react";
import type { AlignedData } from "uplot";
import TimeseriesChart, {
  type TimeseriesChartSeries,
} from "../../../visualization/panels/timeseries/TimeseriesChart";
import { useMcapDataStream } from "./mcap-data-stream-context";
import {
  mcapNumericSeriesKey,
  useMcapNumericSeriesContext,
} from "./mcap-numeric-series-context";
import { useMcapPlotTileSeries } from "./mcap-plot-tile-state";
import type { McapTileProps } from "./mcap-tile-types";
import { joinNumericSeries } from "./numeric-series-join";
import plotStyles from "./McapPlotTile.module.css";
import McapPlotTileSettings from "./McapPlotTileSettings";
import styles from "./McapTile.module.css";

/**
 * Numeric plot tile: charts enabled topic+field series over the full
 * recording with a playback-synced playhead and click-to-seek. Series
 * selection lives in the per-tile plot state and the settings sidebar;
 * data comes from the shared numeric-series cache (fetched on enable,
 * bulk lane).
 */
const McapPlotTile: React.FC<McapTileProps> = () => {
  const seriesConfigs = useMcapPlotTileSeries();
  const { ensureEnumeration, seriesByKey, subscribeSeries } =
    useMcapNumericSeriesContext();
  const dataStream = useMcapDataStream();
  const durationSec = dataStream?.getTimelineIndex()?.durationSec ?? 0;
  const { seek } = usePlayback();
  const store = usePlaybackStore();

  // This effect kicks the plottable-field enumeration for the settings
  // sidebar the first time any plot tile exists.
  useEffect(() => {
    ensureEnumeration();
  }, [ensureEnumeration]);

  // This effect declares interest in every enabled series while the tile
  // shows it; the bridge fetches playhead windows for interested signals
  // and keeps fetched segments cached after unsubscribe.
  useEffect(() => {
    const unsubscribes = seriesConfigs.map((config) =>
      subscribeSeries(config.topic, config.fieldPath),
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
          mcapNumericSeriesKey(config.topic, config.fieldPath),
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
          label: `${entry.config.topic}.${entry.config.fieldPath}`,
          timesSec: entry.state.timesSec,
          values: entry.state.values,
        });
      }
    }
    return out;
  }, [resolved]);

  const chartSeries: readonly TimeseriesChartSeries[] = useMemo(
    () => ready.map((entry) => ({ color: entry.color, label: entry.label })),
    [ready],
  );

  const chartData: AlignedData = useMemo(() => {
    const joined = joinNumericSeries(ready);
    return [joined.xs, ...joined.ys] as AlignedData;
  }, [ready]);

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
  const statusNotes = [
    loadingCount > 0 ? `loading ${loadingCount}` : null,
    errorCount > 0 ? `${errorCount} failed` : null,
    truncated ? "downsampled" : null,
  ].filter(Boolean);

  return (
    <>
      <McapPlotTileSettings />
      <div className={plotStyles.body} data-cy="mcap-plot-tile">
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
            data={chartData}
            durationSec={durationSec}
            onHoverTime={onHoverTime}
            onSeek={seek}
            registerHoverTimeListener={registerHoverTimeListener}
            registerPlayheadListener={registerPlayheadListener}
            series={chartSeries}
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
    </>
  );
};

export default McapPlotTile;
