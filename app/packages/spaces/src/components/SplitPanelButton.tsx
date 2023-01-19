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

  return (
    <IconButton
      title={`Split ${vertical ? "vertically" : "horizontally"}`}
      sx={{ rotate: vertical ? "" : "90deg" }}
      onClick={() => {
        spaces.splitLayout(node, layout);
      }}
    >
      <Splitscreen sx={{ fontSize: 16 }} />
    </IconButton>
  );
}
