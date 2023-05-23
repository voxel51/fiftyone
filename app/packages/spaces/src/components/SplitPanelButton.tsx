import { IconButton } from "@fiftyone/components";
import { Splitscreen } from "@mui/icons-material";
import { Layout } from "../enums";
import { useSpaces } from "../hooks";
import { SplitPanelButtonProps } from "../types";

export default function SplitPanelButton({
  node,
  layout,
  spaceId,
}: SplitPanelButtonProps) {
  const { spaces } = useSpaces(spaceId);
  const vertical = layout === Layout.Vertical;
  const splitLabel = vertical ? "vertically" : "horizontally";

  return (
    <IconButton
      title={`Split ${splitLabel}`}
      sx={{ rotate: vertical ? "" : "90deg" }}
      onClick={() => {
        spaces.splitLayout(node, layout);
      }}
      data-cy={`split-panel-${splitLabel}-button`}
    >
      <Splitscreen sx={{ fontSize: 16 }} />
    </IconButton>
  );
}
