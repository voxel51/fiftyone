import { TileSettingsContent } from "@fiftyone/tiling";
import React, { useMemo } from "react";
import { useStream } from "../../../lib/playback/use-stream";
import LidarSettings from "./LidarSettings";
import styles from "./LidarTile.module.css";

interface LidarFrame {
  points?: Array<[number, number, number]>;
}

export interface LidarTileProps {
  streamId: string;
}

const LidarTile: React.FC<LidarTileProps> = ({ streamId }) => {
  // Stable placeholder scatter when no live data is available.
  const placeholder = useMemo(() => generatePoints(160), []);
  const frame = useStream<LidarFrame>(streamId);

  // Project the stream's 3D points onto the 2D viewBox.
  const livePoints = frame?.points
    ? frame.points.map(([x, , z]) => ({
        x: 50 + x * 8,
        y: 50 + z * 8,
        r: 0.5,
        a: 0.8,
      }))
    : null;
  const points = livePoints ?? placeholder;

  return (
    <div className={styles.body}>
      <TileSettingsContent>
        <LidarSettings />
      </TileSettingsContent>
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
        <span>{livePoints ? `${livePoints.length} pts` : "10 Hz"}</span>
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
