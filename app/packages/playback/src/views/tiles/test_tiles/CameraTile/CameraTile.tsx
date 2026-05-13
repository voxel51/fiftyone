import React from "react";
import { useStream } from "../../../../lib/playback/use-stream";
import { useTileSource } from "../../../../lib/playback/use-tile-state";
import { useTileSettings } from "../../../../lib/TilingProvider";
import CameraSettings from "./CameraSettings";
import styles from "./CameraTile.module.css";

interface CameraFrame {
  frameNumber?: number;
  timestampSec?: number;
  label?: string;
}

/**
 * Camera tile body — placeholder video pane plus an optional live
 * frame-number / label readout from the tile's bound source stream
 * (selected via the settings sidebar's source picker).
 *
 * Reads its source from the per-tile `tileSourceAtom` so the user can
 * swap which camera feed is bound without remounting the tile.
 */
const CameraTile: React.FC = () => {
  useTileSettings(CameraSettings);
  const sourceId = useTileSource();
  const frame = useStream<CameraFrame>(sourceId ?? "");
  return (
    <div className={styles.body}>
      <div className={styles.recIndicator}>
        <span className={styles.recDot} />
        REC
      </div>
      <div className={styles.placeholder}>
        <svg
          viewBox="0 0 32 32"
          className={styles.icon}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="9" width="20" height="14" rx="2" />
          <circle cx="13" cy="16" r="4" />
          <path d="M23 13 L29 9 L29 23 L23 19 Z" />
        </svg>
        <span>
          {sourceId && frame?.label ? frame.label : "Camera feed"}
        </span>
      </div>
    </div>
  );
};

export default CameraTile;
