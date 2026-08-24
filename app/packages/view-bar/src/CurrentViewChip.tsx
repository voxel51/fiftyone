/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The collapsed bar's summary of the applied view: a single pill naming how
 * many stages are in force. Its [x] clears the view; clicking anywhere else
 * on it expands the bar back into the full stage row.
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

export interface CurrentViewChipProps {
  count: number;
  onExpand: () => void;
  onClear: () => void;
}

export const CurrentViewChip: React.FC<CurrentViewChipProps> = ({
  count,
  onExpand,
  onClear,
}) => (
  <Card
    background={CardBackground.Primary}
    outlined
    compact
    data-cy="view-bar-current-view"
    style={{
      height: PILL_HEIGHT,
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Tooltip anchor={Anchor.Bottom} content="Show view stages">
        <div
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
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
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
      </Tooltip>
      <div
        style={{
          width: 1,
          height: 16,
          background: "var(--fo-palette-divider)",
        }}
      />
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
            color: "var(--fo-palette-text-secondary)",
          }}
        >
          <Icon name={IconName.Close} size={Size.Sm} />
        </div>
      </Tooltip>
    </div>
  </Card>
);
