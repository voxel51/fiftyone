import settingsStyles from "./McapTile.settings.module.css";
import { McapSettingsLabel } from "./McapSettingsLabel";
import { McapSettingsSelect } from "./McapSettingsSelect";

/**
 * Coordinate-frame picker shared by the MCAP settings surfaces (world
 * frame, camera target, trajectory frames). Handles the streaming-inventory
 * edge states: no frames known yet, and a selection not yet made.
 */
export function McapFrameSelect({
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
  const selectOptions = [
    ...(options.length === 0 ? [{ label: "No frames", value: "" }] : []),
    ...(options.length > 0 && !value
      ? [{ label: "Select frame", value: "" }]
      : []),
    ...options.map((frameId) => ({ label: frameId, value: frameId })),
  ];

  return (
    <label className={settingsStyles.field}>
      <McapSettingsLabel label={label} tooltip={tooltip} />
      <McapSettingsSelect
        ariaLabel={label}
        disabled={disabled}
        onChange={onChange}
        options={selectOptions}
        value={value}
      />
    </label>
  );
}
