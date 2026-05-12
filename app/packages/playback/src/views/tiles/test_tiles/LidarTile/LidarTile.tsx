import React, { useMemo } from "react";
import { useTileSettings } from "../../../../lib/TilingProvider";
import LidarSettings from "./LidarSettings";
import styles from "./LidarTile.module.css";

const LidarTile: React.FC = () => {
  useTileSettings(LidarSettings);
  // Deterministic-ish scatter so the placeholder is stable across renders.
  const points = useMemo(() => generatePoints(160), []);

  return (
    <div className={styles.body}>
      <svg
        className={styles.points}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={`rgba(140, 200, 255, ${p.a})`}
          />
        ))}
      </svg>
      <div className={styles.label}>
        <span>Lidar · 64ch</span>
        <span>10 Hz</span>
      </div>
    </div>
  );
};

function generatePoints(
  count: number
): { x: number; y: number; r: number; a: number }[] {
  // Seeded pseudo-random so the dots don't move between renders.
  let seed = 1;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pts: { x: number; y: number; r: number; a: number }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.sqrt(rand()) * 45;
    pts.push({
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      r: rand() * 0.4 + 0.2,
      a: rand() * 0.5 + 0.2,
    });
  }
  return pts;
}

export default LidarTile;
