import { TileSettingsContent } from "@fiftyone/tiling";
import React from "react";
import { useStream } from "../../../lib/playback/use-stream";
import CameraSettings from "./CameraSettings";
import styles from "./CameraTile.module.css";

interface CameraFrame {
  frameNumber?: number;
  timestampSec?: number;
  label?: string;
}

export interface CameraTileProps {
  streamId: string;
}

const CameraTile: React.FC<CameraTileProps> = ({ streamId }) => {
  const frame = useStream<CameraFrame>(streamId);
  return (
    <div className={styles.body}>
      <TileSettingsContent>
        <CameraSettings />
      </TileSettingsContent>
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
        <span>{frame?.label ?? "Camera feed"}</span>
      </div>
    </div>
  );
};

export default CameraTile;
