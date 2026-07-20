import React from "react";

import styles from "./Episode3dViewControls.module.css";

interface Episode3dViewControlsProps {
  readonly onEgoView: () => void;
  readonly onTopView: () => void;
}

/** Compact camera-preset controls overlaid on the episode 3D canvas. */
export const Episode3dViewControls = React.memo(function Episode3dViewControls({
  onEgoView,
  onTopView,
}: Episode3dViewControlsProps) {
  return (
    <div aria-label="Camera views" className={styles.controls} role="group">
      <ViewPresetButton
        keyLabel="E"
        label="Ego view"
        onClick={onEgoView}
        tooltip="Ego-like view of the current camera target (E)"
      />
      <ViewPresetButton
        keyLabel="T"
        label="Top view"
        onClick={onTopView}
        tooltip="Top-down view of the current camera target (T)"
      />
    </div>
  );
});

function ViewPresetButton({
  keyLabel,
  label,
  onClick,
  tooltip,
}: {
  readonly keyLabel: "E" | "T";
  readonly label: string;
  readonly onClick: () => void;
  readonly tooltip: string;
}) {
  return (
    <button
      aria-keyshortcuts={keyLabel}
      aria-label={label}
      className={styles.button}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      title={tooltip}
      type="button"
    >
      <span aria-hidden="true">{keyLabel}</span>
    </button>
  );
}
