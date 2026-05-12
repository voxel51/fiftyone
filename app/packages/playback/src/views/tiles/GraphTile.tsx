import { useAtomValue } from "jotai";
import React, { useMemo } from "react";
import { playheadAtom } from "../../lib/playback-atoms";
import { usePlayback } from "../../lib/PlaybackProvider";
import { useTileSettings } from "../../lib/TilingProvider";
import GraphSettings from "./GraphSettings";
import styles from "./GraphTile.module.css";

const CHART_VIEWBOX_W = 200;
const CHART_VIEWBOX_H = 80;

/**
 * Graph tile body — two stylized line series with a vertical playhead
 * cursor synced to the current playback time. Chrome is provided
 * externally (see `Tile` / `MosaicGrid`).
 */
const GraphTile: React.FC = () => {
  useTileSettings(GraphSettings);
  const { path1, path2 } = useMemo(() => buildPaths(), []);
  const playhead = useAtomValue(playheadAtom);
  const { duration } = usePlayback();
  const ratio = duration > 0 ? Math.max(0, Math.min(1, playhead / duration)) : 0;
  const playheadX = ratio * CHART_VIEWBOX_W;

  return (
    <div className={styles.body}>
      <svg
        viewBox={`0 0 ${CHART_VIEWBOX_W} ${CHART_VIEWBOX_H}`}
        className={styles.chart}
        preserveAspectRatio="none"
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

function buildPaths(): { path1: string; path2: string } {
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pts1: string[] = [];
  const pts2: string[] = [];
  for (let x = 0; x <= CHART_VIEWBOX_W; x += 4) {
    const t = x / CHART_VIEWBOX_W;
    const y1 = 40 + Math.sin(t * 7) * 20 + (rand() - 0.5) * 4;
    const y2 = 40 + Math.cos(t * 5 + 1) * 14 + (rand() - 0.5) * 3;
    pts1.push(`${x === 0 ? "M" : "L"}${x} ${y1.toFixed(1)}`);
    pts2.push(`${x === 0 ? "M" : "L"}${x} ${y2.toFixed(1)}`);
  }
  return { path1: pts1.join(" "), path2: pts2.join(" ") };
}

export default GraphTile;
