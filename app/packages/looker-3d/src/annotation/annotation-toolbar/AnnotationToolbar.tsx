import useCanAnnotate from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotate";
import * as fos from "@fiftyone/state";
import { Box, Typography, styled } from "@mui/material";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { useRecoilValue } from "recoil";
import type { AnnotationAction, AnnotationToolbarProps } from "../types";
import { useAnnotationActions } from "./useAnnotationActions";
import {
  Anchor,
  Orientation,
  Toolbar,
  ToolbarAction,
  ToolbarGroup,
  Tooltip,
  ZIndex,
} from "@voxel51/voodo";

const GroupLabel = styled(Typography)(({ theme }) => ({
  fontSize: "9px",
  fontWeight: 600,
  color: theme.palette.text.secondary,
  textAlign: "center",
  marginBottom: "2px",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
}));

const ActionButton = ({ action }: { action: AnnotationAction }) => (
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

export const AnnotationToolbar = ({ className }: AnnotationToolbarProps) => {
  const { actions } = useAnnotationActions();
  const canAnnotate = useCanAnnotate();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  );
  const isFullscreen = useRecoilValue(fos.fullscreen);

  // Find the modal container to render the toolbar in the same stacking context as navigation arrows
  useEffect(() => {
    if (!canAnnotate) {
      setPortalContainer(null);
      return;
    }

    const modalElement = document.getElementById("modal");
    if (modalElement) {
      setPortalContainer(modalElement);
    } else {
      setPortalContainer(document.body);
    }
  }, [canAnnotate]);

  if (!canAnnotate || !portalContainer) {
    return null;
  }

  const toolbarContent = (
    <Toolbar
      className={className}
      orientation={Orientation.Column}
      lockX
      xOffset={isFullscreen ? 8 : 50}
      yOffset={isFullscreen ? 55 : 100}
      zIndex={ZIndex.AboveModal}
    >
      {actions
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

  // Render the toolbar in a portal to ensure it's in the same stacking context as navigation arrows
  return ReactDOM.createPortal(toolbarContent, portalContainer);
};
