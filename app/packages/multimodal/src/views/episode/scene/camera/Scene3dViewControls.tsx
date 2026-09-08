import React from "react";

import controlStyles from "../../../../visualization/panel-ui/PanelControl.module.css";
import styles from "./Scene3dViewControls.module.css";

interface Scene3dViewControlsProps {
  readonly onEgoView: () => void;
  readonly onTopView: () => void;
}

/** Compact camera-preset controls overlaid on the episode 3D canvas. */
export const Scene3dViewControls = React.memo(function Scene3dViewControls({
  onEgoView,
  onTopView,
}: Scene3dViewControlsProps) {
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
      className={`${styles.button} ${controlStyles.button}`}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      title={tooltip}
      type="button"
    >
      <span aria-hidden="true">{keyLabel}</span>
    </button>
  );
}
