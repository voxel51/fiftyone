import {
  BackgroundColor,
  Pill,
  Size,
  Text,
  TextColor,
  TextVariant,
  type IconInput,
} from "@voxel51/voodo";
import type { FC, ReactNode } from "react";
import styles from "./SelectionTray.module.css";

type Tone = "info" | "success" | "warning" | "error";

const ICON_COLOR: Record<Tone, TextColor> = {
  info: TextColor.Secondary,
  success: TextColor.Success,
  warning: TextColor.Warning,
  error: TextColor.Destructive,
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
      : (icon as FC<{
          size?: Size;
          color?: TextColor;
        }>);
  return (
    <div className={styles.notice} data-tone={tone} role={role}>
      {Icon && (
        <span className={styles.noticeIcon}>
          <Icon size={Size.Sm} color={ICON_COLOR[tone]} />
        </span>
      )}
      <span className={styles.noticeBody}>
        <Text variant={TextVariant.Sm}>{title}</Text>
        {children ? (
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
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
      size={Size.Xs}
      backgroundColor={
        explicit ? BackgroundColor.Selected : BackgroundColor.Raised
      }
      color={explicit ? TextColor.Accent : TextColor.Secondary}
    >
      {explicit ? "Selected" : "All results"}
    </Pill>
  );
}
