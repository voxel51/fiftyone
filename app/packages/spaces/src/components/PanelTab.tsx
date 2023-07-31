import { useCallback } from "react";
import { IconButton } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import {
  usePanel,
  usePanelCloseEffect,
  usePanelTitle,
  useSpaces,
} from "../hooks";
import { PanelTabProps } from "../types";
import { warnPanelNotFound } from "../utils";
import PanelIcon from "./PanelIcon";
import { StyledTab, TabIndicatorContainer } from "./StyledElements";

export default function PanelTab({ node, active, spaceId }: PanelTabProps) {
  const { spaces } = useSpaces(spaceId);
  const panelName = node.type;
  const panelId = node.id;
  const panel = usePanel(panelName);
  const [title] = usePanelTitle(panelId);
  const closeEffect = usePanelCloseEffect(panelId);

  const handleClose = useCallback(() => {
    if (node.pinned) return;
    closeEffect();
    spaces.removeNode(node);
  }, [node, closeEffect, spaces]);

  if (!panel) return warnPanelNotFound(panelName);

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
      <PanelIcon name={panelName as string} />
      {title || panel.label || panel.name}
      {TabIndicator && (
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
