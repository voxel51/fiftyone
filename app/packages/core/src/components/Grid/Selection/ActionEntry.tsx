import {
  Anchor,
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
  type IconInput,
} from "@voxel51/voodo";
import type { FC } from "react";
import styles from "./SelectionTray.module.css";

export interface ActionEntryProps {
  label: string;
  icon: IconInput;
  onClick: () => void;
  /** When present the control is disabled and the reason is surfaced. */
  disabledReason: string | null;
  busy?: boolean;
  busyLabel?: string;
  /** Kept for contributed actions; every toolbar action now reads the same. */
  emphasis?: "primary" | "secondary";
  /** Where the action is rendered: the toolbar row or the overflow menu. */
  surface?: "toolbar" | "menu";
  "aria-haspopup"?: "dialog" | "menu";
  "aria-expanded"?: boolean;
}

type IconComponent = FC<{ size?: Size; color?: TextColor }>;

/**
 * One contributed action. In the toolbar it is a button whose disabled reason
 * is a tooltip; in the overflow menu it is a row whose reason is a subtext.
 */
export default function ActionEntry({
  label,
  icon,
  onClick,
  disabledReason,
  busy = false,
  busyLabel,
  emphasis: _emphasis = "secondary",
  surface = "toolbar",
  ...aria
}: ActionEntryProps) {
  const disabled = Boolean(disabledReason) || busy;
  const text = busy ? (busyLabel ?? label) : label;
  if (surface === "menu") {
    const Icon = typeof icon === "string" ? null : (icon as IconComponent);
    return (
      <button
        type="button"
        role="menuitem"
        className={styles.menuRow}
        disabled={disabled}
        aria-busy={busy || undefined}
        onClick={onClick}
        {...aria}
      >
        {Icon && <Icon size={Size.Sm} color={TextColor.Secondary} />}
        <span className={styles.menuRowText}>
          <Text variant={TextVariant.Sm}>{text}</Text>
          {disabledReason && (
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              {disabledReason}
            </Text>
          )}
        </span>
      </button>
    );
  }
  const button = (
    <Button
      size={Size.Sm}
      variant={Variant.Borderless}
      leadingIcon={icon}
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={onClick}
      {...aria}
    >
      {text}
    </Button>
  );
  return disabledReason ? (
    <Tooltip
      anchor={Anchor.Top}
      wrapperClassName={styles.tipWrap}
      content={<Text variant={TextVariant.Sm}>{disabledReason}</Text>}
    >
      {button}
    </Tooltip>
  ) : (
    button
  );
}
