import {
  FilterAltIcon,
  FilterAltOffIcon,
  HideImageIcon,
  IconAction,
  type IconProps,
  ImageIcon,
  Size,
  Tooltip,
  VisibilityIcon,
  VisibilityOffIcon,
} from "@voxel51/voodo";
import type { FC, ForwardedRef } from "react";
import React from "react";
import styled from "styled-components";

type ItemProp = {
  icon?: string;
  value: string;
  tooltip?: string;
  color?: string; // icon color
  highlightedBGColor?: string; // background color onHover
  onClick: React.MouseEventHandler;
};

const StyledPanelItem = styled.div<{ color?: string }>`
  cursor: pointer;
  &:hover {
    background-color: ${({ color }) => color ?? "transparent"};
  }
`;

const Text = styled.div`
  font-size: 1rem;
  margin: auto auto auto 5px;
`;

export const getIcon = (icon: string): FC<IconProps> => {
  switch (String(icon).toLowerCase()) {
    case "filteralticon":
      return FilterAltIcon;
    case "filteraltofficon":
      return FilterAltOffIcon;
    case "imageicon":
      return ImageIcon;
    case "hideimageicon":
      return HideImageIcon;
    case "visibilityicon":
      return VisibilityIcon;
    case "visibilityofficon":
      return VisibilityOffIcon;

    default:
      throw new Error(`no icon for ${icon}`);
  }
};

function TooltipWrapper({
  children,
  tooltip,
}: React.PropsWithChildren<{ tooltip?: string }>) {
  if (tooltip) {
    return (
      <Tooltip content={tooltip} anchor="right">
        {children}
      </Tooltip>
    );
  }

  return <>{children}</>;
}

const Item = React.forwardRef(
  (
    { icon, value, tooltip, color, highlightedBGColor, onClick }: ItemProp,
    ref: ForwardedRef<HTMLDivElement>,
  ) => {
    const id = String(value)
      .replace(/[\s.,/]/g, "-")
      .toLowerCase();

    if (!icon) {
      <StyledPanelItem>
        <div data-cy={`filter-option-${id}`}>{value}</div>
      </StyledPanelItem>;
    }

    return (
      <StyledPanelItem color={highlightedBGColor}>
        <TooltipWrapper tooltip={tooltip}>
          <div
            style={{ display: "flex", flexDirection: "row" }}
            ref={ref}
            onClick={onClick}
            data-cy={`filter-option-${id}`}
          >
            {icon ? (
              <IconAction
                icon={getIcon(icon)}
                size={Size.Lg}
                aria-label={value}
                style={{ color }}
              />
            ) : null}

            <Text>{value}</Text>
          </div>
        </TooltipWrapper>
      </StyledPanelItem>
    );
  },
);

export default React.memo(Item);
