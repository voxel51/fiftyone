import {
  FilterAltIcon,
  FilterAltOffIcon,
  HideImageIcon,
  type IconProps,
  ImageIcon,
  Text,
  TextColor,
  TextVariant,
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

const ROW = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 28,
  padding: "0 0.375rem",
} as const;

const ItemIcon = ({ icon, color }: { icon: string; color?: string }) => {
  const Icon = getIcon(icon);
  return <Icon size={14} color={color} style={{ flexShrink: 0 }} />;
};

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
            style={ROW}
            ref={ref}
            onClick={onClick}
            data-cy={`filter-option-${id}`}
          >
            {icon ? <ItemIcon icon={icon} color={color} /> : null}
            <Text
              variant={TextVariant.BodyTertiary}
              color={TextColor.Secondary}
            >
              {value}
            </Text>
          </div>
        </TooltipWrapper>
      </StyledPanelItem>
    );
  },
);

export default React.memo(Item);
