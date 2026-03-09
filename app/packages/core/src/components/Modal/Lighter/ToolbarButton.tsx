import {
  Anchor,
  Clickable,
  Icon,
  IconName,
  Size,
  Tooltip,
} from "@voxel51/voodo";
import styled from "styled-components";

export interface ToolbarButtonProps {
  tooltip: string;
  icon: IconName;
  onClick: () => void;
}

const ButtonWrapper = styled.span`
  display: inline-flex;
  transition: transform 0.15s ease;
  &:hover {
    transform: translateY(-2px);
  }
`;

const ToolbarButton = ({ tooltip, icon, onClick }: ToolbarButtonProps) => (
  <Tooltip content={tooltip} anchor={Anchor.Top} portal aria-label={tooltip}>
    <ButtonWrapper>
      <Clickable onClick={onClick}>
        <Icon name={icon} size={Size.Lg} />
      </Clickable>
    </ButtonWrapper>
  </Tooltip>
);

export default ToolbarButton;
