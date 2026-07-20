import { Text, TextColor, TextVariant } from "@voxel51/voodo";

import settingsStyles from "../tiles/EpisodeTile.settings.module.css";

/** Keyboard-accessible help affordance shared by episode settings surfaces. */
export function EpisodeSettingsTooltip({
  tooltip,
}: {
  readonly tooltip: string;
}) {
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
export function EpisodeSettingsLabel({
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
      <EpisodeSettingsTooltip tooltip={tooltip} />
    </span>
  );
}
