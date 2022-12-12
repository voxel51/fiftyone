import { useSpaces } from "../hooks";
import SpaceNode from "../SpaceNode";
import { AddPanelItemProps } from "../types";
import PanelIcon from "./PanelIcon";
import { StyledPanelItem } from "./StyledElements";

export default function AddPanelItem({
  node,
  name,
  label,
  onClick,
  spaceId,
}: AddPanelItemProps) {
  const { spaces } = useSpaces(spaceId);
  return (
    <StyledPanelItem
      onClick={() => {
        const newNode = new SpaceNode();
        newNode.type = name;
        spaces.addNodeAfter(node, newNode);
        if (onClick) onClick();
      }}
    >
      <PanelIcon name={name} />
      {label}
    </StyledPanelItem>
  );
}
