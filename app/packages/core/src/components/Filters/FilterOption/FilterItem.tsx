import {
  Tooltip,
  MuiFilterAltIcon as FilterAltIcon,
  MuiFilterAltOffIcon as FilterAltOffIcon,
  MuiHideImageIcon as HideImageIcon,
  MuiImageIcon as ImageIcon,
  MuiVisibilityIcon as VisibilityIcon,
  MuiVisibilityOffIcon as VisibilityOffIcon,
} from "@fiftyone/components";
import IconButton from "@mui/material/IconButton";
import type { ForwardedRef } from "react";
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
  background-color: ${({ theme }) => theme.background.secondary};
  &:hover {
    background-color: ${({ color, theme }) =>
      color ?? theme.background.secondary};
  }
`;

const Text = styled.div`
  font-size: 1rem;
  margin: auto auto auto 5px;
`;

export const getIcon = (icon: string) => {
  switch (String(icon).toLowerCase()) {
    case "filteralticon":
      return <FilterAltIcon fontSize="small" />;
    case "filteraltofficon":
      return <FilterAltOffIcon fontSize="small" />;
    case "imageicon":
      return <ImageIcon fontSize="small" />;
    case "hideimageicon":
      return <HideImageIcon fontSize="small" />;
    case "visibilityicon":
      return <VisibilityIcon fontSize="small" />;
    case "visibilityofficon":
      return <VisibilityOffIcon fontSize="small" />;

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
      <Tooltip text={tooltip} placement="right-start">
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
              <IconButton sx={{ color: color }}>{getIcon(icon!)}</IconButton>
            ) : null}

            <Text>{value}</Text>
          </div>
        </TooltipWrapper>
      </StyledPanelItem>
    );
  },
);

export default React.memo(Item);
