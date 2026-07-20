import { useMemo } from "react";
import settingsStyles from "./EpisodeTile.settings.module.css";
import { EpisodeSettingsLabel } from "./EpisodeSettingsLabel";
import { EpisodeSettingsSelect } from "./EpisodeSettingsSelect";

/**
 * Coordinate-frame picker shared by the episode settings surfaces (world
 * frame, camera target, trajectory frames). Handles the streaming-inventory
 * edge states: no frames known yet, and a selection not yet made.
 */
export function EpisodeFrameSelect({
  disabled,
  label,
  onChange,
  options,
  tooltip,
  value,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly string[];
  readonly tooltip: string;
  readonly value: string;
}) {
  // Memoized so the select's descriptor list stays stable across the
  // frequent parent re-renders that don't change the frame inventory.
  const selectOptions = useMemo(
    () => [
      ...(options.length === 0 ? [{ label: "No frames", value: "" }] : []),
      ...(options.length > 0 && !value
        ? [{ label: "Select frame", value: "" }]
        : []),
      ...options.map((frameId) => ({ label: frameId, value: frameId })),
    ],
    [options, value],
  );

  return (
    <label className={settingsStyles.field}>
      <EpisodeSettingsLabel label={label} tooltip={tooltip} />
      <EpisodeSettingsSelect
        ariaLabel={label}
        disabled={disabled}
        onChange={onChange}
        options={selectOptions}
        value={value}
      />
    </label>
  );
}
