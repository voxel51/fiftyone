/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Domain-agnostic renderer for a data-driven Voodo toolbar.
 *
 * Accepts a list of ToolbarActionGroup objects and renders them using the
 * Voodo Toolbar/ToolbarGroup/ToolbarAction primitives. Owns NO portal logic,
 * NO domain state, and NO visibility gating — callers are responsible for
 * those concerns.
 */

import { Box, Typography, styled } from "@mui/material";
import {
  Anchor,
  Orientation,
  Toolbar,
  ToolbarAction,
  ToolbarGroup,
  Tooltip,
  ZIndex,
} from "@voxel51/voodo";
import type { ToolbarActionItem, ToolbarActionGroup } from "./types";

const GroupLabel = styled(Typography)(({ theme }) => ({
  fontSize: "9px",
  fontWeight: 600,
  color: theme.palette.text.secondary,
  textAlign: "center",
  marginBottom: "2px",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
}));

export interface ActionToolbarProps {
  groups: ToolbarActionGroup[];
  orientation?: Orientation;
  lockX?: boolean;
  lockY?: boolean;
  xOffset?: number;
  yOffset?: number;
  zIndex?: ZIndex;
  visible?: boolean;
  className?: string;
}

const ActionButton = ({ action }: { action: ToolbarActionItem }) => (
  <Tooltip
    portal
    content={
      <Box>
        {typeof action.tooltip === "string" ? (
          <Typography variant="body2">{action.tooltip}</Typography>
        ) : (
          action.tooltip
        )}
        {action.shortcut && (
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {action.shortcut}
          </Typography>
        )}
      </Box>
    }
    anchor={Anchor.Right}
  >
    <ToolbarAction
      active={action.isActive}
      disabled={action.isDisabled}
      onClick={action.onClick}
    >
      {action.icon}
    </ToolbarAction>
  </Tooltip>
);

export const ActionToolbar = ({
  groups,
  orientation = Orientation.Column,
  lockX,
  lockY,
  xOffset,
  yOffset,
  zIndex = ZIndex.AboveModal,
  visible,
  className,
}: ActionToolbarProps) => (
  <Toolbar
    className={className}
    orientation={orientation}
    lockX={lockX}
    lockY={lockY}
    xOffset={xOffset}
    yOffset={yOffset}
    zIndex={zIndex}
    visible={visible}
  >
    {groups
      .filter((group) => !group.isHidden)
      .filter((group) =>
        group.actions.some((action) => action.isVisible !== false)
      )
      .map((group) => (
        <ToolbarGroup key={group.id}>
          {group.label && <GroupLabel>{group.label}</GroupLabel>}
          {group.actions
            .filter((action) => action.isVisible !== false)
            .map((action) =>
              action.customComponent ? (
                <div key={action.id}>{action.customComponent}</div>
              ) : (
                <ActionButton key={action.id} action={action} />
              )
            )}
        </ToolbarGroup>
      ))}
  </Toolbar>
);
