import {
  Anchor,
  Icon,
  IconColor,
  IconName,
  Size,
  Text,
  TextVariant,
  Tooltip,
} from "@voxel51/voodo";
import React from "react";
import { SaveHealth } from "../persistence";
import styles from "./SaveStatusIndicator.module.css";

/** Semantic icon colour per save-health state. */
const HEALTH_COLOR: Record<SaveHealth, IconColor> = {
  [SaveHealth.Healthy]: IconColor.Success,
  [SaveHealth.Unhealthy]: IconColor.Warning,
  [SaveHealth.Stopped]: IconColor.Failure,
};

const formatSyncedAt = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

export interface SaveStatusIndicatorProps {
  /** Which health state to render. */
  health: SaveHealth;
  /** When true, the icon slowly pulses to signal an in-flight request. */
  pulsing?: boolean;
  /**
   * Epoch ms of the last successful save. Falls back to the current time for
   * the initial render, before anything has been saved this session.
   */
  lastSavedAt?: number | null;
  /** Icon size. Defaults to {@link Size.Sm}. */
  size?: Size;
}

/**
 * Presentational save-status light: a coloured, softly glowing dot that mirrors
 * annotation autosave health (green healthy / amber unhealthy / red stopped),
 * slowly pulses while a request is in flight, and shows the last sync time on
 * hover. Fully controlled — see {@link AnnotationSaveIndicator} for the
 * annotation-bound wrapper.
 */
export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  health,
  pulsing = false,
  lastSavedAt = null,
  size = Size.Sm,
}) => {
  const syncedLine = `Last synced at ${formatSyncedAt(lastSavedAt ?? Date.now())}`;

  return (
    <Tooltip
      anchor={Anchor.Top}
      portal
      content={<Text variant={TextVariant.Sm}>{syncedLine}</Text>}
    >
      <span className={styles.indicator} role="status" aria-label={syncedLine}>
        <Icon
          name={IconName.Circle}
          size={size}
          color={HEALTH_COLOR[health]}
          className={pulsing ? styles.pulsing : ""}
        />
      </span>
    </Tooltip>
  );
};
