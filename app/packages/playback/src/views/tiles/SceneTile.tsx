import React from "react";
import styles from "./SceneTile.module.css";

/**
 * 3D scene tile body — wireframe cube on a grid floor. Chrome is provided
 * externally (see `Tile` / `MosaicGrid`).
 */
const SceneTile: React.FC = () => (
  <div className={styles.body}>
    <svg viewBox="0 0 200 160" className={styles.scene}>
      <g className={styles.grid}>
        {Array.from({ length: 11 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            x2={200}
            y1={100 + i * 5}
            y2={100 + i * 5}
          />
        ))}
        {Array.from({ length: 11 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={100 + (i - 5) * 12}
            x2={100 + (i - 5) * 28}
            y1={100}
            y2={155}
          />
        ))}
      </g>
      {/* Wireframe cube */}
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M70 60 L130 60 L150 50 L90 50 Z" />
        <path d="M70 60 L70 110 L130 110 L130 60" />
        <path d="M130 60 L150 50 L150 100 L130 110" />
        <path
          d="M70 60 L90 50 M90 50 L90 100 M150 100 L130 110 M90 100 L70 110"
          strokeDasharray="2 2"
        />
      </g>
    </svg>
    <div className={styles.label}>
      <span>Scene · world</span>
    </div>
  </div>
);

export default SceneTile;
