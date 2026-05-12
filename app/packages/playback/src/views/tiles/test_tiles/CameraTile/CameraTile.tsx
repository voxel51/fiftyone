import React from "react";
import { useTileSettings } from "../../../../lib/TilingProvider";
import CameraSettings from "./CameraSettings";
import styles from "./CameraTile.module.css";

/**
 * Camera tile body — just the placeholder video pane. The Tile chrome
 * (title + actions) is provided externally: either by `<Tile>` for
 * standalone usage or by `<MosaicGrid>`'s toolbar in a mosaic context.
 *
 * Registers its settings UI with the surrounding `TilingProvider` so the
 * page-level sidebar can show it when this tile is focused.
 */
const CameraTile: React.FC = () => {
  useTileSettings(CameraSettings);
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
        <span>Camera feed</span>
      </div>
    </div>
  );
};

export default CameraTile;
