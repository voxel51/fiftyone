import type { ToolbarActionItem } from "@fiftyone/components";
import {
  Align,
  Button,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import { useVideoAnnotationActions } from "../hooks/useVideoAnnotationActions";
import styles from "./VideoAnnotationToolbar.module.css";

/**
 * Renders a single {@link ToolbarActionItem} as a tooltip-wrapped icon button.
 * Mirrors `ActionToolbar`'s per-action handling: `customComponent` is an escape
 * hatch, the action's `icon` node is the button content, and the tooltip shows
 * the shortcut alongside the hint.
 */
const Action: React.FC<{ action: ToolbarActionItem }> = ({ action }) => {
  if (action.customComponent) {
    return <>{action.customComponent}</>;
  }

  const button = (
    <Button
      variant={Variant.Icon}
      size={Size.Xs}
      disabled={action.isDisabled}
      aria-label={action.label}
      onClick={action.onClick}
    >
      {action.icon}
    </Button>
  );

  if (!action.tooltip && !action.shortcut) {
    // A disabled <button> swallows pointer events, so even the no-tooltip
    // case wraps in the span for consistent layout.
    return <span className={styles.slot}>{button}</span>;
  }

  return (
    <Tooltip
      portal
      content={
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          align={Align.Center}
        >
          {action.shortcut && (
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              ({action.shortcut})
            </Text>
          )}
          <Text variant={TextVariant.Sm}>{action.tooltip ?? action.label}</Text>
        </Stack>
      }
    >
      {/* Tooltip anchors to the span, not the (possibly disabled) button. */}
      <span className={styles.slot}>{button}</span>
    </Tooltip>
  );
};

/**
 * Action bar between the playback controls and the timestamp.
 *
 * Thin, data-driven renderer: all behavior lives in
 * {@link useVideoAnnotationActions}, which returns `ToolbarActionGroup`s in the
 * same shape `ActionToolbar` consumes elsewhere. This component only lays the
 * groups out inline in the controls row — the shared `ActionToolbar` renders a
 * floating, draggable palette, which is wrong for this slot. Add functionality
 * by editing the hook, not this file.
 */
export const VideoAnnotationToolbar: React.FC = () => {
  const groups = useVideoAnnotationActions();

  return (
    <Stack
      orientation={Orientation.Row}
      align={Align.Center}
      spacing={Spacing.Sm}
      className={styles.root}
    >
      {groups
        .filter(
          (group) =>
            !group.isHidden &&
            group.actions.some((action) => action.isVisible !== false),
        )
        .map((group) => (
          <Stack
            key={group.id}
            orientation={Orientation.Row}
            align={Align.Center}
            spacing={Spacing.Xs}
          >
            {group.actions
              .filter((action) => action.isVisible !== false)
              .map((action) => (
                <Action key={action.id} action={action} />
              ))}
          </Stack>
        ))}
    </Stack>
  );
};
