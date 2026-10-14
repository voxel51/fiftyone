import {
  BackgroundColor,
  Pill,
  Text,
  TextColor,
  type IconInput,
  type IconProps,
} from "@voxel51/voodo";
import type { FC, ReactNode } from "react";
import styles from "./SelectionTray.module.css";

type Tone = "info" | "success" | "warning" | "error";

const ICON_COLOR: Record<Tone, TextColor> = {
  info: TextColor.Secondary,
  success: TextColor.Success,
  warning: TextColor.Warning,
  error: TextColor.Failure,
};

interface NoticeProps {
  tone: Tone;
  icon: IconInput;
  title: ReactNode;
  children?: ReactNode;
  role?: "alert" | "status";
}

/** A compact, toned feedback block for dialogs and pickers. */
export function Notice({ tone, icon, title, children, role }: NoticeProps) {
  const Icon =
    typeof icon === "string"
      ? null
      : (icon as FC<IconProps>);
  return (
    <div className={styles.notice} data-tone={tone} role={role}>
      {Icon && (
        <span className={styles.noticeIcon}>
          <Icon size="sm" color={ICON_COLOR[tone]} />
        </span>
      )}
      <span className={styles.noticeBody}>
        <Text variant="body-tertiary">{title}</Text>
        {children ? (
          <Text variant="caption" color="text-secondary">
            {children}
          </Text>
        ) : null}
      </span>
    </div>
  );
}

/** Names the frozen scope of a workflow: the tray selection or all results. */
export function ScopePill({ source }: { source: "explicit" | "results" }) {
  const explicit = source === "explicit";
  return (
    <Pill
      size="xs"
      backgroundColor={
        explicit ? BackgroundColor.Selected : BackgroundColor.CardElevated
      }
      color={explicit ? TextColor.Accent : TextColor.Secondary}
    >
      {explicit ? "Selected" : "All results"}
    </Pill>
  );
}
