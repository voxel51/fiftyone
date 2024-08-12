import { useTrackEvent } from "@fiftyone/analytics";
import { Stack, Typography } from "@mui/material";
import { Layout } from "../enums";
import { useSpaces } from "../hooks";
import SpaceNode from "../SpaceNode";
import { AddPanelItemProps } from "../types";
import PanelIcon from "./PanelIcon";

export default function AddPanelItem({
  node,
  name,
  label,
  onClick,
  spaceId,
}: AddPanelItemProps) {
  const trackEvent = useTrackEvent();
  const { spaces } = useSpaces(spaceId);
  return (
    <Stack
      direction="row"
      data-cy={`new-panel-option-${name}`}
      onClick={(e) => {
        trackEvent("open_panel", { panel: name });
        const newNode = new SpaceNode();
        newNode.type = name;
        spaces.addNodeAfter(node, newNode);
        if (e.altKey) {
          spaces.splitLayout(node, Layout.Horizontal);
        } else if (e.shiftKey) {
          spaces.splitLayout(node, Layout.Vertical);
        }
        if (onClick) onClick();
      }}
      sx={{
        cursor: "pointer",
        padding: "4px 8px",
        alignItems: "center",
        "&:hover": { background: "var(--fo-palette-background-body)" },
      }}
    >
      <PanelIcon name={name} />
      <Typography
        sx={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label || (name as string)}
      </Typography>
    </Stack>
  );
}
