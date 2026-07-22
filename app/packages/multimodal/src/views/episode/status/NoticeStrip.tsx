import {
  Align,
  Card,
  CardBackground,
  Icon,
  IconColor,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import type { HealthNotice, HealthSeverity } from "./health";
import styles from "./NoticeStrip.module.css";

const SEVERITY_ICON: Record<HealthSeverity, IconName> = {
  error: IconName.Error,
  info: IconName.Info,
  warning: IconName.Warning,
};

const SEVERITY_ICON_COLOR: Record<HealthSeverity, IconColor> = {
  error: IconColor.Destructive,
  info: IconColor.Info,
  warning: IconColor.Warning,
};

const SEVERITY_TEXT_COLOR: Record<HealthSeverity, TextColor> = {
  error: TextColor.Destructive,
  info: TextColor.Info,
  warning: TextColor.Warning,
};

/**
 * Status strip a sidebar surface mounts above its controls: one row per
 * stabilized health notice for that surface's scope. Purely presentational —
 * producing, stabilizing, and scoping notices is the caller's job — and it
 * renders nothing while the scope is healthy, so quiet scenes pay no chrome.
 */
const NoticeStrip: React.FC<{
  readonly notices: readonly HealthNotice[];
}> = ({ notices }) => {
  if (notices.length === 0) {
    return null;
  }

  return (
    <Card background={CardBackground.Secondary} compact outlined>
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        {notices.map((notice) => (
          <Stack
            align={Align.Start}
            key={notice.id}
            orientation={Orientation.Row}
            spacing={Spacing.Sm}
          >
            <span className={styles.iconSlot}>
              <Icon
                color={SEVERITY_ICON_COLOR[notice.severity]}
                name={SEVERITY_ICON[notice.severity]}
                size={Size.Sm}
              />
            </span>
            <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
              <Text
                color={SEVERITY_TEXT_COLOR[notice.severity]}
                variant={TextVariant.Sm}
              >
                {notice.message}
              </Text>
              {notice.detail ? (
                <Text color={TextColor.Secondary} variant={TextVariant.Xs}>
                  {notice.detail}
                </Text>
              ) : null}
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
};

export default NoticeStrip;
