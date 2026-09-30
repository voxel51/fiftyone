import { Tooltip, Text, TextVariant, Anchor } from "@voxel51/voodo";
import { useRef, type KeyboardEvent } from "react";
import styles from "./SelectionTray.module.css";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Present when the option cannot be chosen; shown as a tooltip. */
  disabledReason?: string | null;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/**
 * A controlled radio group styled as a segmented control. Arrow keys move
 * between enabled options, matching native radio behavior.
 */
export default function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: Props<T>) {
  const root = useRef<HTMLDivElement>(null);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = options.filter((option) => !option.disabledReason);
    if (!enabled.length) return;
    const current = Math.max(
      0,
      enabled.findIndex((option) => option.value === value),
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabled.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) %
            enabled.length;
    onChange(enabled[next].value);
    root.current
      ?.querySelector<HTMLButtonElement>(
        `[data-value="${enabled[next].value}"]`,
      )
      ?.focus();
  };
  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={label}
      className={styles.segmented}
      onKeyDown={move}
    >
      {options.map((option) => {
        const checked = option.value === value;
        const button = (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={option.value}
            tabIndex={checked ? 0 : -1}
            className={styles.segment}
            disabled={disabled || Boolean(option.disabledReason)}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
        return option.disabledReason ? (
          <Tooltip
            key={option.value}
            anchor={Anchor.Top}
            wrapperClassName={styles.tipWrap}
            content={
              <Text variant={TextVariant.Sm}>{option.disabledReason}</Text>
            }
          >
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
