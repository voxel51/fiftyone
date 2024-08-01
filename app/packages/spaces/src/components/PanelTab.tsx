import { IconButton } from "@fiftyone/components";
import { useTimeout } from "@fiftyone/state";
import { Close } from "@mui/icons-material";
import { Skeleton, Typography } from "@mui/material";
import { useCallback } from "react";
import { PANEL_LOADING_TIMEOUT } from "../constants";
import {
  usePanelCloseEffect,
  usePanelTitle,
  useReactivePanel,
  useSpaces,
} from "../hooks";
import { PanelTabProps } from "../types";
import PanelIcon from "./PanelIcon";
import { StyledTab, TabIndicatorContainer } from "./StyledElements";

export default function PanelTab({ node, active, spaceId }: PanelTabProps) {
  const { spaces } = useSpaces(spaceId);
  const panelName = node.type as string;
  const panelId = node.id;
  const panel = useReactivePanel(panelName);
  const [title] = usePanelTitle(panelId);
  const closeEffect = usePanelCloseEffect(panelId);
  const pending = useTimeout(PANEL_LOADING_TIMEOUT);

  const handleClose = useCallback(() => {
    if (node.pinned) return;
    closeEffect();
    spaces.removeNode(node);
  }, [node, closeEffect, spaces]);

  const TabIndicator = panel?.panelOptions?.TabIndicator;

  return (
    <StyledTab
      onMouseDown={(e) => {
        if (e.button === 1) {
          handleClose();
        }
      }}
      onClick={() => {
        if (!active) spaces.setNodeActive(node);
      }}
      active={active}
      data-cy={`panel-tab-${(panelName as string).toLowerCase()}`}
    >
      {!panel && pending && <Skeleton width={48} height={24} />}
      {!panel && !pending && <Typography>{panelName}</Typography>}
      {panel && <PanelIcon name={panelName as string} />}
      {panel && <Typography>{title || panel.label || panel.name}</Typography>}
      {panel && TabIndicator && (
        <TabIndicatorContainer>
          <TabIndicator />
        </TabIndicatorContainer>
      )}
      {!node.pinned && (
        <IconButton
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleClose();
          }}
          sx={{ pb: 0, mr: "-8px" }}
          title="Close"
        >
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      )}
    </StyledTab>
  );
}
