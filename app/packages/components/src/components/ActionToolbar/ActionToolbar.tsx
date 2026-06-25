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

import { styled, Typography } from "@mui/material";
import {
  Align,
  Anchor,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  Toolbar,
  ToolbarAction,
  ToolbarGroup,
  Tooltip,
  ZIndex,
} from "@voxel51/voodo";
import type { ToolbarActionGroup, ToolbarActionItem } from "./types";

const GroupLabel = styled(Typography)(({ theme }) => ({
  fontSize: "9px",
  fontWeight: 600,
  color: theme.palette.text.secondary,
  textAlign: "center",
  marginBottom: "2px",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
}));

const StyledToolbarAction = styled(ToolbarAction)({
  cursor: "pointer",
  "&:disabled": {
    cursor: "default",
  },
});

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

const ActionButton = ({ action }: { action: ToolbarActionItem }) => {
  const button = (
    <StyledToolbarAction
      active={action.isActive}
      disabled={action.isDisabled}
      onClick={action.onClick}
      aria-label={action.label}
      data-cy={action.id}
      data-cy-active={String(action.isActive ?? false)}
    >
      {action.icon}
    </StyledToolbarAction>
  );

  if (!action.tooltip && !action.shortcut) return button;

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
            <Text color={TextColor.Tertiary} style={{ fontWeight: 600 }}>
              ({action.shortcut})
            </Text>
          )}
          {typeof action.tooltip === "string" ? (
            <Text color={TextColor.Secondary}>{action.tooltip}</Text>
          ) : (
            action.tooltip
          )}
        </Stack>
      }
      anchor={Anchor.Right}
    >
      {button}
    </Tooltip>
  );
};

/**
 * Renders a data-driven Voodo toolbar from a list of `ToolbarActionGroup`s.
 *
 * Hides groups whose `isHidden` is true or whose actions are all
 * `isVisible: false`. Within a visible group, individual actions with
 * `isVisible: false` are also skipped. Each action renders as a
 * `ToolbarAction` icon button by default; if `customComponent` is provided,
 * it replaces the standard button. Tooltips wrap the button when `tooltip`
 * or `shortcut` is set.
 *
 * The component owns no portal logic, no domain state, and no visibility
 * gating — callers handle mounting, action wiring, and when to show it.
 */
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
      .filter(
        (group) =>
          !group.isHidden &&
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
