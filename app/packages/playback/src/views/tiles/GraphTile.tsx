import React, { useMemo } from "react";
import styles from "./GraphTile.module.css";

/**
 * Graph tile body — two stylized line series. Chrome is provided externally
 * (see `Tile` / `MosaicGrid`).
 */
const GraphTile: React.FC = () => {
  const { path1, path2 } = useMemo(() => buildPaths(), []);

  return (
    <div className={styles.body}>
      <svg
        viewBox="0 0 200 80"
        className={styles.chart}
        preserveAspectRatio="none"
      >
        {[16, 32, 48, 64].map((y) => (
          <line
            key={y}
            x1={0}
            x2={200}
            y1={y}
            y2={y}
            className={styles.gridLine}
          />
        ))}
        <line x1={0} x2={200} y1={80} y2={80} className={styles.axis} />
        <path d={path1} className={styles.series1} />
        <path d={path2} className={styles.series2} />
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
  // Deterministic sine-y curves so the visual is stable.
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pts1: string[] = [];
  const pts2: string[] = [];
  for (let x = 0; x <= 200; x += 4) {
    const t = x / 200;
    const y1 = 40 + Math.sin(t * 7) * 20 + (rand() - 0.5) * 4;
    const y2 = 40 + Math.cos(t * 5 + 1) * 14 + (rand() - 0.5) * 3;
    pts1.push(`${x === 0 ? "M" : "L"}${x} ${y1.toFixed(1)}`);
    pts2.push(`${x === 0 ? "M" : "L"}${x} ${y2.toFixed(1)}`);
  }
  return { path1: pts1.join(" "), path2: pts2.join(" ") };
}

export default GraphTile;
