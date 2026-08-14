import { Anchor, Text, TextColor, TextVariant, Tooltip } from "@voxel51/voodo";

import settingsStyles from "../../tiles/Tile.settings.module.css";

/**
 * Keyboard-accessible help affordance shared by episode settings surfaces.
 * `Tooltip`'s default anchor (`Top`) centers the panel horizontally over the
 * trigger with no viewport-edge collision detection, so it can run off the
 * left edge for triggers this close to it — this component lives only in
 * the left sidebar, so anchoring `Right` (grows away from that edge) sidesteps
 * the problem entirely.
 */
export function SettingsTooltip({ tooltip }: { readonly tooltip: string }) {
  return (
    <Tooltip anchor={Anchor.Right} content={tooltip} portal>
      <span
        aria-label={tooltip}
        className={settingsStyles.tooltipIcon}
        role="img"
        tabIndex={0}
      >
        ?
      </span>
    </Tooltip>
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
