import { Layout } from "../enums";
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
      data-cy={`new-panel-option-${name}`}
      onClick={(e) => {
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
    >
      <PanelIcon name={name} />
      {label || (name as string)}
    </StyledPanelItem>
  );
}
