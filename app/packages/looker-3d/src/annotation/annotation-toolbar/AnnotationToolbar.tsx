import { DragIndicator } from "@mui/icons-material";
import { Box, IconButton, Tooltip, Typography, styled } from "@mui/material";
import React, { useCallback, useRef, useState } from "react";
import { useRecoilState } from "recoil";
import { annotationToolbarPositionAtom } from "../../state";
import type { AnnotationToolbarProps } from "../types";
import { useAnnotationActions } from "./useAnnotationActions";

const ToolbarContainer = styled(Box)<{
  topposition: number;
  isdragging?: string;
}>(({ theme, topposition, isdragging }) => {
  const isDraggingBool = isdragging === "true";

  return {
    position: "absolute",
    top: `${topposition}%`,
    left: "8px",
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.palette.background.paper,
    borderRadius: "6px",
    boxShadow: isDraggingBool
      ? "0 4px 16px rgba(0, 0, 0, 0.2)"
      : "0 2px 8px rgba(0, 0, 0, 0.12)",
    border: `1px solid ${theme.palette.divider}`,
    zIndex: 1000,
    minWidth: "36px",
    opacity: isDraggingBool ? 0.95 : 0.75,
    userSelect: "none",
    transition: isDraggingBool
      ? "none"
      : "opacity 0.2s ease, box-shadow 0.2s ease",

    "&:hover": {
      opacity: 0.95,
    },
  };
});

const DraggableHeader = styled(Box)<{ isdragging?: string }>(
  ({ theme, isdragging }) => {
    const isDraggingBool = isdragging === "true";

    return {
      width: "100%",
      height: "12px",
      borderRadius: "6px 6px 0 0",
      cursor: isDraggingBool ? "grabbing" : "grab",
      opacity: 0,
      transition: "opacity 0.2s ease",
      margin: "2px 2px 0 2px",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",

      ".MuiBox-root:hover &": {
        opacity: 0.8,
      },

      // rotate drag handler by 90 degrees
      "& > *": {
        transform: "rotate(90deg)",
      },
    };
  }
);

const ToolbarContent = styled(Box)({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "8px",
});

const ActionGroup = styled(Box)({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  alignItems: "center",
});

const GroupLabel = styled(Typography)(({ theme }) => ({
  fontSize: "9px",
  fontWeight: 600,
  color: theme.palette.text.secondary,
  textAlign: "center",
  marginBottom: "2px",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
}));

const ActionButton = styled(IconButton)<{
  isactive?: string;
  isdisabled?: string;
}>(({ theme, isactive, isdisabled }) => {
  const isActiveBool = isactive === "true";
  const isDisabledBool = isdisabled === "true";

  return {
    width: "28px",
    height: "28px",
    cursor: isDisabledBool ? "not-allowed" : "pointer",
    backgroundColor: isActiveBool ? theme.palette.primary.main : "transparent",
    color: isActiveBool
      ? theme.palette.primary.contrastText
      : isDisabledBool
      ? theme.palette.text.disabled
      : theme.palette.text.primary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "&:hover": {
      backgroundColor: isActiveBool
        ? theme.palette.primary.dark
        : theme.palette.action.hover,
    },
    "&:disabled": {
      color: theme.palette.text.disabled,
      backgroundColor: "transparent",
    },
    "& .MuiSvgIcon-root": {
      fontSize: "18px",
    },
  };
});

export const AnnotationToolbar = ({ className }: AnnotationToolbarProps) => {
  const { actions } = useAnnotationActions();
  const [position, setPosition] = useRecoilState(annotationToolbarPositionAtom);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ y: 0, position: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleActionClick = useCallback((action: () => void) => {
    action();
  }, []);

  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      setDragStart({
        y: e.clientY,
        position: position,
      });
    },
    [position]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaY = e.clientY - dragStart.y;
      const containerHeight =
        containerRef.current?.parentElement?.clientHeight || window.innerHeight;
      const deltaPercentage = (deltaY / containerHeight) * 100;

      const newPosition = Math.max(
        5,
        Math.min(95, dragStart.position + deltaPercentage)
      );
      setPosition(newPosition);
    },
    [isDragging, dragStart, setPosition]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <ToolbarContainer
      ref={containerRef}
      className={className}
      topposition={position}
      isdragging={String(isDragging)}
    >
      <DraggableHeader
        isdragging={String(isDragging)}
        onMouseDown={handleHeaderMouseDown}
      >
        <DragIndicator />
      </DraggableHeader>
      <ToolbarContent>
        {actions
          .filter((group) => !group.isHidden)
          .map((group) => (
            <ActionGroup key={group.id}>
              {group.label && <GroupLabel>{group.label}</GroupLabel>}
              {group.actions
                .filter((action) => action.isVisible !== false)
                .map((action) => {
                  // Render custom component if provided
                  if (action.customComponent) {
                    return <Box key={action.id}>{action.customComponent}</Box>;
                  }

                  // Render regular action button if no custom component is provided
                  return (
                    <Tooltip
                      key={action.id}
                      title={
                        <Box>
                          <Typography variant="body2">
                            {action.tooltip || action.label}
                          </Typography>
                          {action.shortcut && (
                            <Typography variant="caption" sx={{ opacity: 0.7 }}>
                              {action.shortcut}
                            </Typography>
                          )}
                        </Box>
                      }
                      placement="left"
                      arrow
                      disableHoverListener={false}
                    >
                      <ActionButton
                        onClick={() =>
                          !action.isDisabled &&
                          handleActionClick(action.onClick)
                        }
                        isdisabled={String(action.isDisabled)}
                        isactive={String(action.isActive)}
                        size="small"
                      >
                        {action.icon}
                      </ActionButton>
                    </Tooltip>
                  );
                })}
            </ActionGroup>
          ))}
      </ToolbarContent>
    </ToolbarContainer>
  );
};
