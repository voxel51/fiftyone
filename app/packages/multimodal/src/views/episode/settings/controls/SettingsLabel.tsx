import { Text, TextColor, TextVariant } from "@voxel51/voodo";

import settingsStyles from "../../tiles/Tile.settings.module.css";

/** Keyboard-accessible help affordance shared by episode settings surfaces. */
export function SettingsTooltip({ tooltip }: { readonly tooltip: string }) {
  return (
    <span
      aria-label={tooltip}
      className={settingsStyles.tooltipIcon}
      data-tooltip={tooltip}
      role="img"
      tabIndex={0}
    >
      ?
    </span>
  );
}

/** Setting label with the shared keyboard-accessible episode help affordance. */
export function SettingsLabel({
  label,
  tooltip,
}: {
  readonly label: string;
  readonly tooltip: string;
}) {
  return (
    <span className={settingsStyles.labelWithTooltip}>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        {label}
      </Text>
      <SettingsTooltip tooltip={tooltip} />
    </span>
  );
}
