import { IconButton } from "@fiftyone/components";
import { Close } from "@mui/icons-material";
import { usePanel, usePanelTitle, useSpaces } from "../hooks";
import { PanelTabProps } from "../types";
import { warnPanelNotFound } from "../utils";
import PanelIcon from "./PanelIcon";
import { StyledTab } from "./StyledElements";

export default function PanelTab({ node, active, spaceId }: PanelTabProps) {
  const { spaces } = useSpaces(spaceId);
  const panelName = node.type;
  const panel = usePanel(panelName);
  const [title] = usePanelTitle(node.id);

  if (!panel) return warnPanelNotFound(panelName);

  return (
    <StyledTab
      onClick={() => {
        if (!active) spaces.setNodeActive(node);
      }}
      active={active}
    >
      <PanelIcon name={panelName as string} />
      {title || panel.label || panel.name}
      {!node.pinned && (
        <IconButton
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            spaces.removeNode(node);
          }}
          sx={{ pb: 0 }}
          title="Close"
        >
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      )}
    </StyledTab>
  );
}
