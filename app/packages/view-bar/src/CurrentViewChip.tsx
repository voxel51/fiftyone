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
  Anchor,
  Card,
  CardBackground,
  Icon,
  IconName,
  Size,
  Tooltip,
} from "@voxel51/voodo";
import React from "react";

import { PILL_HEIGHT } from "./StageCard";

/**
 * Applies the root view. Rendered whenever at least one stage is present —
 * collapsed or expanded, its position in the bar does not move.
 */
export const ClearViewButton: React.FC<{ onClear: () => void }> = ({
  onClear,
}) => (
  <Tooltip anchor={Anchor.Bottom} content="Clear view">
    <div
      onClick={onClear}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClear();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Clear view"
      data-cy="view-bar-clear-view"
      style={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: 12,
        color: "var(--fo-palette-text-secondary)",
        flexShrink: 0,
      }}
    >
      <Icon name={IconName.Close} size={Size.Sm} />
    </div>
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
    onMouseEnter={onExpand}
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
    style={{
      height: PILL_HEIGHT,
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
      cursor: "pointer",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Icon name={IconName.Boxes} size={Size.Sm} />
      <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
        Current view
      </span>
      <span
        style={{
          fontSize: 12,
          color: "var(--fo-palette-text-secondary)",
          whiteSpace: "nowrap",
        }}
      >
        {count} {count === 1 ? "stage" : "stages"}
      </span>
    </div>
  </Card>
);
