import { useSpaces } from "../hooks";
import { SplitPanelButtonProps } from "../types";
import { GhostButton } from "./StyledElements";

export default function SplitPanelButton({
  node,
  layout,
  spaceId,
}: SplitPanelButtonProps) {
  const { spaces } = useSpaces(spaceId);

  return (
    <GhostButton
      onClick={() => {
        spaces.splitLayout(node, layout);
      }}
    >
      [ ]
    </GhostButton>
  );
}
