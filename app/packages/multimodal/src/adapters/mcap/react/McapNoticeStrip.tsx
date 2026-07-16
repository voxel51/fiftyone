import {
  Align,
  Card,
  CardBackground,
  ErrorIcon,
  IconColor,
  InfoIcon,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  WarningIcon,
  type IconProps,
} from "@voxel51/voodo";
import React, { type FC } from "react";
import type { McapHealthNotice, McapHealthSeverity } from "./mcap-health";
import styles from "./McapNoticeStrip.module.css";

const SEVERITY_ICON: Record<McapHealthSeverity, FC<IconProps>> = {
  error: ErrorIcon,
  info: InfoIcon,
  warning: WarningIcon,
};

const SEVERITY_ICON_COLOR: Record<McapHealthSeverity, IconColor> = {
  error: IconColor.Destructive,
  info: IconColor.Info,
  warning: IconColor.Warning,
};

const SEVERITY_TEXT_COLOR: Record<McapHealthSeverity, TextColor> = {
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
const McapNoticeStrip: React.FC<{
  readonly notices: readonly McapHealthNotice[];
}> = ({ notices }) => {
  if (notices.length === 0) {
    return null;
  }

  return (
    <Card background={CardBackground.Secondary} compact outlined>
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        {notices.map((notice) => {
          const SeverityIcon = SEVERITY_ICON[notice.severity];
          return (
            <Stack
              align={Align.Start}
              key={notice.id}
              orientation={Orientation.Row}
              spacing={Spacing.Sm}
            >
              <span className={styles.iconSlot}>
                <SeverityIcon
                  color={SEVERITY_ICON_COLOR[notice.severity]}
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
          );
        })}
      </Stack>
    </Card>
  );
};

export default McapNoticeStrip;
