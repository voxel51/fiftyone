import { Text, TextColor, TextVariant } from "@voxel51/voodo";

import settingsStyles from "../../tiles/Tile.settings.module.css";
import { SettingsLabel } from "./SettingsLabel";
import { SettingsNumberField } from "./SettingsNumberField";

/** Labeled numeric field shared by episode settings sections. */
export function SettingsNumberInput({
  disabled,
  label,
  max,
  min,
  onChange,
  step,
  tooltip,
  value,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly max?: number;
  readonly min: number;
  readonly onChange: (value: number) => void;
  readonly step: number;
  readonly tooltip?: string;
  readonly value: number;
}) {
  return (
    <label className={settingsStyles.field}>
      {tooltip ? (
        <SettingsLabel label={label} tooltip={tooltip} />
      ) : (
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          {label}
        </Text>
      )}
      <SettingsNumberField
        ariaLabel={label}
        disabled={disabled}
        max={max}
        min={min}
        onCommit={onChange}
        step={step}
        value={value}
      />
    </label>
  );
}
