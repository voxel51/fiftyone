import React, { DetailedReactHTMLElement } from "react";
import styled from "styled-components";
import { IconButton } from "@mui/material";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import ImageIcon from "@mui/icons-material/Image";
import HideImageIcon from "@mui/icons-material/HideImage";
import { Tooltip } from "@fiftyone/components";

type ItemProp = {
  icon?: string;
  value: string;
  tooltip?: string;
  color?: string; // icon color
  highlightedBGColor?: string; // background color onHover
  onClick: () => void;
};

const Text = styled.div`
  font-size: 1rem;
  margin: auto auto auto 5px;
  ${({ theme }) => theme.text.secondary};
`;

const Item = React.memo(
  React.forwardRef(
    (
      { icon, value, tooltip, color, highlightedBGColor, onClick }: ItemProp,
      ref: ForwardedRef<HTMLDivElement>
    ) => {
      const StyledPanelItem = styled.div`
        cursor: pointer;
        background-color: ${({ theme }) => theme.background.secondary};
        &:hover {
          background-color: ${({ theme }) =>
            highlightedBGColor ?? theme.background.secondary};
        }
      `;

      if (!icon) {
        <StyledPanelItem>
          <div>{value}</div>
        </StyledPanelItem>;
      }

      const getIcon = (icon: string) => {
        switch (icon.toLowerCase()) {
          case "filteralticon":
            return <FilterAltIcon fontSize="small" />;
          case "filteraltofficon":
            return <FilterAltOffIcon fontSize="small" />;
          case "imageicon":
            return <ImageIcon fontSize="small" />;
          case "hideimageicon":
            return <HideImageIcon fontSize="small" />;
        }
      };

      const children = (
        <div
          style={{ display: "flex", flexDirection: "row" }}
          ref={ref}
          onClick={onClick}
        >
          {icon ? (
            <IconButton sx={{ color: color }}>{getIcon(icon!)}</IconButton>
          ) : null}

          <Text>{value}</Text>
        </div>
      );

      return (
        <StyledPanelItem>
          {tooltip ? (
            <Tooltip text={tooltip} placement="right-start">
              {children}
            </Tooltip>
          ) : (
            <>{children}</>
          )}
        </StyledPanelItem>
      );
    }
  )
);

export default Item;
