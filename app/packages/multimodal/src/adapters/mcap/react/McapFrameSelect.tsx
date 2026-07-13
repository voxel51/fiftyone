import settingsStyles from "./McapTile.settings.module.css";
import { McapSettingsLabel } from "./McapSettingsLabel";

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
  return (
    <label className={settingsStyles.field}>
      <McapSettingsLabel label={label} tooltip={tooltip} />
      <select
        aria-label={label}
        className={settingsStyles.select}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.length === 0 ? <option value="">No frames</option> : null}
        {options.length > 0 && !value ? (
          <option value="">Select frame</option>
        ) : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
