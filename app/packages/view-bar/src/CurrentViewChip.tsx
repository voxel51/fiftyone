/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The collapsed bar's summary of the applied view: a pill naming how many
 * stages are in force. Hovering (or clicking, or keyboard-activating) it
 * expands the bar back into the full stage row.
 *
 * Clearing lives beside the chip, not inside it: hover-to-expand means the
 * chip vanishes under the pointer, so anything clickable on it never gets
 * the click. The [x] renders in the same spot in both bar states instead.
 */

import {
  Align,
  Anchor,
  Button,
  Card,
  CardBackground,
  Icon,
  IconName,
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

import styles from "./CurrentViewChip.module.css";
import { PILL_HEIGHT } from "./StageCard";

/**
 * Applies the root view. Rendered whenever at least one stage is present —
 * collapsed or expanded, its position in the bar does not move.
 */
export const ClearViewButton: React.FC<{ onClear: () => void }> = ({
  onClear,
}) => (
  <Tooltip anchor={Anchor.Bottom} content="Clear view">
    <Button
      onClick={onClear}
      aria-label="Clear view"
      data-cy="view-bar-clear-view"
      variant={Variant.Icon}
      size={Size.Sm}
      borderless
      leadingIcon={IconName.Close}
      className={styles.clear}
    />
  </Tooltip>
);

export interface CurrentViewChipProps {
  count: number;
  onExpand: () => void;
}

export const CurrentViewChip: React.FC<CurrentViewChipProps> = ({
  count,
  onExpand,
}) => (
  <Card
    background={CardBackground.Primary}
    outlined
    compact
    data-cy="view-bar-current-view"
    onClick={onExpand}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onExpand();
      }
    }}
    role="button"
    tabIndex={0}
    aria-label="Show view stages"
    className={styles.chip}
    style={{ height: PILL_HEIGHT }}
  >
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.Sm}
      align={Align.Center}
    >
      <Icon name={IconName.Boxes} size={Size.Sm} />
      <Text variant={TextVariant.Md} className={styles.label}>
        Current view
      </Text>
      <Text
        variant={TextVariant.Sm}
        color={TextColor.Secondary}
        className={styles.count}
      >
        {count} {count === 1 ? "stage" : "stages"}
      </Text>
    </Stack>
  </Card>
);
