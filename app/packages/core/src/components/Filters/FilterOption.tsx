import React, { PropsWithChildren } from "react";
import styled from "styled-components";
import { RecoilState, useRecoilState, useRecoilValue } from "recoil";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import ImageIcon from "@mui/icons-material/Image";
import HideImageIcon from "@mui/icons-material/HideImage";
import { IconButton } from "@mui/material";
import { useSpring } from "framer-motion";

import { useOutsideClick } from "@fiftyone/state";
import { useTheme } from "@fiftyone/components/src/components/ThemeProvider";

import { PopoutDiv } from "../utils";
import { joinStringArray } from "./utils";
import Tooltip from "@fiftyone/components/src/components/Tooltip";

interface Props {
  //   excludeAtom: RecoilState<boolean>;
  labels: string[];
  valueName: string;
  color: string;
}

const Text = styled.div`
  font-size: 14px;
  margin: auto;
  ${({ theme }) => theme.text.secondary};
`;

type Option = { value: string; icon?: string; tooltip: string };

const options = [
  {
    icon: "FilterAltIcon",
    value: "Filter labels",
    tooltip: "backend for filter labels",
  },
  {
    icon: "ImageIcon",
    value: "Show samples with lables",
    tooltip: "backend for match samples",
  },
  {
    icon: "FilterAltOffIcon",
    value: "Exclude Labels",
    tooltip: "backend for exclude labels",
  },
  {
    icon: "HideImageIcon",
    value: "Show samples that don't have labels",
    tooltip: "backend for show negative match samples",
  },
];

const currentSelection = (
  key: string,
  selectedLabels: string[],
  valueName: string
) => {
  // returns the text for selected filter method

  const item = selectedLabels.length > 1 ? valueName + "s" : valueName;
  switch (key) {
    case "Filter labels":
      return `Filter ${joinStringArray(selectedLabels)} ${item}`;
    case "Exclude Labels":
      return `Exclude ${joinStringArray(selectedLabels)} ${item}`;
    case "Show samples with lables":
      return `Show samples with ${joinStringArray(selectedLabels)} ${item}`;
    case "Show samples that don't have labels":
      return `Show samples that don't have ${joinStringArray(
        selectedLabels
      )} ${item}`;
    default:
      return key;
  }
};

const FilterOption: React.FC<Props> = ({ labels, color, valueName }) => {
  const [key, setKey] = React.useState("Filter labels");
  const [open, setOpen] = React.useState(false);
  const theme = useTheme();

  const popoutRef = React.useRef();

  useOutsideClick(popoutRef, () => {
    setOpen(false);
  });

  const onSelectItem = (value: string) => {
    setKey(value);
    setOpen(false);
  };

  const Selected = () => {
    // render the icon for selected filter method
    const icon = options.find((o) => o.value === key)?.icon;
    if (!icon) return <>{key}</>;

    switch (icon.toLowerCase()) {
      case "filteralticon":
        return <FilterAltIcon />;
      case "filteraltofficon":
        return <FilterAltOffIcon />;
      case "imageicon":
        return <ImageIcon />;
      case "hideimageicon":
        return <HideImageIcon />;
      default:
        return <>{key}</>;
    }
  };

  return (
    <FilterOptionContainer ref={popoutRef}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          backgroundColor: theme.background.level3,
          marginTop: "5px",
        }}
      >
        <IconButton
          onClick={() => setOpen(!open)}
          sx={{ color: color }}
          // color="primary"
        >
          <Selected />
        </IconButton>
        <Text>{currentSelection(key, labels, valueName)}</Text>
      </div>
      {open && (
        <Popout style={{ padding: 0 }}>
          {options.map((option: Option) => (
            <Item {...option} onClick={() => onSelectItem(option.value)} />
          ))}
        </Popout>
      )}
    </FilterOptionContainer>
  );
};

export default FilterOption;

type ItemProp = {
  icon?: string;
  value: string;
  tooltip: string;
  onClick: () => void;
};
const Item = React.memo(
  React.forwardRef(({ icon, value, tooltip, onClick }: ItemProp, ref) => {
    if (!icon) {
      <StyledPanelItem>
        <div>{value}</div>
      </StyledPanelItem>;
    }

    const getIcon = (icon: string) => {
      switch (icon.toLowerCase()) {
        case "filteralticon":
          return <FilterAltIcon />;
        case "filteraltofficon":
          return <FilterAltOffIcon />;
        case "imageicon":
          return <ImageIcon />;
        case "hideimageicon":
          return <HideImageIcon />;
      }
    };

    const children = (
      <div
        style={{ display: "flex", flexDirection: "row" }}
        ref={ref}
        onClick={() => onClick(value)}
      >
        <span>{getIcon(icon!)}</span>
        <span>{value}</span>
      </div>
    );

    return (
      <StyledPanelItem>
        {tooltip ? (
          <Tooltip text={tooltip!}>{children}</Tooltip>
        ) : (
          <>{children}</>
        )}
      </StyledPanelItem>
    );
  })
);

// TODO: once feat-space-embeddings branch is merged, the bottom should be removed. It's a duplciate.
export type PopoutProps = PropsWithChildren<{
  style?: any;
  modal?: boolean;
}>;

function Popout({ children, style = {}, modal }: PopoutProps) {
  const show = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  });

  return (
    <PopoutDiv
      style={{
        ...show,
        ...style,
        zIndex: "200000 !important",
        right: modal ? 0 : "unset",
      }}
    >
      {children}
    </PopoutDiv>
  );
}

const FilterOptionContainer = styled.div`
  position: relative;
`;

const StyledPanelItem = styled.div`
  cursor: pointer;
  padding: 4px 8px;
  background-color: ${({ theme }) => theme.background.secondary};
  &:hover {
    background-color: ${({ theme }) => theme.background.secondary};
  }
`;
