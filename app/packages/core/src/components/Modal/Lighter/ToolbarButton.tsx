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
  /** Optional data-cy for e2e tests */
  testId?: string;
}

const ButtonWrapper = styled.span`
  display: inline-flex;
  transition: transform 0.15s ease;
  &:hover {
    transform: translateY(-2px);
  }
`;

const ToolbarButton = ({
  tooltip,
  icon,
  onClick,
  testId,
}: ToolbarButtonProps) => (
  <Tooltip content={tooltip} anchor={Anchor.Top} portal aria-label={tooltip}>
    <ButtonWrapper>
      <Clickable onClick={onClick} data-cy={testId}>
        <Icon name={icon} size={Size.Lg} />
      </Clickable>
    </ButtonWrapper>
  </Tooltip>
);

export default ToolbarButton;
