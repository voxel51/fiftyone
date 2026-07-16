import { Anchor, Clickable, Size, Tooltip } from "@voxel51/voodo";
import type { IconProps } from "@voxel51/voodo";
import type { FC } from "react";
import styled from "styled-components";

export interface ToolbarButtonProps {
  tooltip: string;
  icon: FC<IconProps>;
  onClick: () => void;
  /** Optional data-testid for e2e tests */
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
  icon: IconComponent,
  onClick,
  testId,
}: ToolbarButtonProps) => (
  <Tooltip content={tooltip} anchor={Anchor.Top} portal aria-label={tooltip}>
    <ButtonWrapper>
      <Clickable onClick={onClick} data-testid={testId}>
        <IconComponent size={Size.Lg} />
      </Clickable>
    </ButtonWrapper>
  </Tooltip>
);

export default ToolbarButton;
