import React from "react";
import { useStream } from "../../../../lib/playback/use-stream";
import { useTileSettings } from "../../../../lib/TilingProvider";
import CameraSettings from "./CameraSettings";
import styles from "./CameraTile.module.css";

interface CameraFrame {
  frameNumber?: number;
  timestampSec?: number;
  label?: string;
}

export interface CameraTileProps {
  /**
   * If provided, the tile subscribes to the stream with this id and
   * shows its live `label` / `frameNumber` payload. Omit to render the
   * static placeholder (used by the standalone tile stories).
   */
  streamId?: string;
}

/**
 * Camera tile body — placeholder video pane plus an optional live
 * frame-number / label readout from a connected stream. The Tile chrome
 * (title + actions) is provided externally: either by `<Tile>` for
 * standalone usage or by `<MosaicGrid>`'s toolbar in a mosaic context.
 *
 * Registers its settings UI with the surrounding `TilingProvider` so the
 * page-level sidebar can show it when this tile is focused.
 */
const CameraTile: React.FC<CameraTileProps> = ({ streamId }) => {
  useTileSettings(CameraSettings);
  const frame = useStream<CameraFrame>(streamId ?? "");
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
          {streamId && frame?.label
            ? frame.label
            : "Camera feed"}
        </span>
      </div>
    </div>
  );
};

export default CameraTile;
