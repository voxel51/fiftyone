import { TileSettingsContent, useSetTileSelection } from "@fiftyone/tiling";
import React, { useMemo } from "react";
import { usePlayback } from "../../../lib/playback/PlaybackProvider";
import { usePlayhead } from "../../../lib/playback/use-playback-state";
import GraphSettings from "./GraphSettings";
import styles from "./GraphTile.module.css";

const CHART_VIEWBOX_W = 200;
const CHART_VIEWBOX_H = 80;
const SAMPLE_STEP = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export interface GraphTileProps {
  /** Stream id (currently unused — the chart is closed-form). Accepted
   *  so the demo story can render the graph tile through the same
   *  `streamId`-prop interface as the others. */
  streamId?: string;
}

/**
 * Graph tile body — two stylized line series with a vertical playhead
 * cursor synced to the current playback time. Clicking the chart both
 * seeks the playhead AND publishes the sample at that time to
 * `tileSelectionAtom` so the inspector sidebar can read it.
 */
const GraphTile: React.FC<GraphTileProps> = () => {
  const { samples, path1, path2 } = useMemo(() => buildPaths(), []);
  const playhead = usePlayhead();
  const { duration, seek } = usePlayback();
  const setSelection = useSetTileSelection();
  const ratio = duration > 0 ? clamp(playhead / duration, 0, 1) : 0;
  const playheadX = ratio * CHART_VIEWBOX_W;

  const handleChartClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const r = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const time = r * duration;
    seek(time);

    // Sample the curves at the click position so the inspector has
    // values to display. y is in viewBox space (0–80) where 40 is the
    // chart's mid line; normalize to [-1, 1] for readability.
    const sampleIndex = Math.round(r * (samples.length - 1));
    const s = samples[sampleIndex];
    setSelection({
      kind: "graph-sample",
      timeSec: time,
      ratio: r,
      values: {
        velocity: normalize(s.velocity),
        accel: normalize(s.accel),
      },
    });
  };

  return (
    <div className={styles.body}>
      <TileSettingsContent>
        <GraphSettings />
      </TileSettingsContent>
      <svg
        viewBox={`0 0 ${CHART_VIEWBOX_W} ${CHART_VIEWBOX_H}`}
        className={styles.chart}
        preserveAspectRatio="none"
        onClick={handleChartClick}
      >
        {[16, 32, 48, 64].map((y) => (
          <line
            key={y}
            x1={0}
            x2={CHART_VIEWBOX_W}
            y1={y}
            y2={y}
            className={styles.gridLine}
          />
        ))}
        <line
          x1={0}
          x2={CHART_VIEWBOX_W}
          y1={CHART_VIEWBOX_H}
          y2={CHART_VIEWBOX_H}
          className={styles.axis}
        />
        <path d={path1} className={styles.series1} />
        <path d={path2} className={styles.series2} />
        {/* Playhead cursor synced to currentTime / duration. */}
        <line
          x1={playheadX}
          x2={playheadX}
          y1={0}
          y2={CHART_VIEWBOX_H}
          className={styles.playhead}
        />
      </svg>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: "#4a9eff" }} />
          velocity
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: "#ff7c4a" }} />
          accel
        </span>
      </div>
    </div>
  );
};

interface Sample {
  velocity: number;
  accel: number;
}

/** Convert a viewBox y (0–80, mid 40) to a normalized signal in roughly [-1, 1]. */
function normalize(y: number): number {
  return Number(((40 - y) / 25).toFixed(3));
}

function buildPaths(): {
  samples: Sample[];
  path1: string;
  path2: string;
} {
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const samples: Sample[] = [];
  const pts1: string[] = [];
  const pts2: string[] = [];
  for (let x = 0; x <= CHART_VIEWBOX_W; x += SAMPLE_STEP) {
    const t = x / CHART_VIEWBOX_W;
    const y1 = 40 + Math.sin(t * 7) * 20 + (rand() - 0.5) * 4;
    const y2 = 40 + Math.cos(t * 5 + 1) * 14 + (rand() - 0.5) * 3;
    samples.push({ velocity: y1, accel: y2 });
    pts1.push(`${x === 0 ? "M" : "L"}${x} ${y1.toFixed(1)}`);
    pts2.push(`${x === 0 ? "M" : "L"}${x} ${y2.toFixed(1)}`);
  }
  return { samples, path1: pts1.join(" "), path2: pts2.join(" ") };
}

export default GraphTile;
