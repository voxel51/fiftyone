import { Text, TextColor, TextVariant } from "@voxel51/voodo";

import settingsStyles from "./McapTile.settings.module.css";

/** Setting label with the shared keyboard-accessible MCAP help affordance. */
export function McapSettingsLabel({
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
      <span
        aria-label={tooltip}
        className={settingsStyles.tooltipIcon}
        data-tooltip={tooltip}
        role="img"
        tabIndex={0}
      >
        ?
      </span>
    </span>
  );
}
