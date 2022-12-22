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
import { getRGB } from "@fiftyone/utilities";

interface Props {
  //   excludeAtom: RecoilState<boolean>;
  labels: string[];
  valueName: string;
  color: string;
}

const Text = styled.div`
  font-size: 1rem;
  margin: auto auto auto 5px;
  ${({ theme }) => theme.text.secondary};
`;

type Option = { value: string; icon?: string; tooltip: string };

const FilterOption: React.FC<Props> = ({ labels, color, valueName }) => {
  const [key, setKey] = React.useState("filter");
  const [open, setOpen] = React.useState(false);
  const theme = useTheme();
  const [r, g, b] = getRGB(color);
  const highlightedBGColor = `rgba(${r}, ${g}, ${b}, 0.25)`;

  const popoutRef = React.useRef();
  const ref = React.useRef();

  useOutsideClick(popoutRef, () => {
    setOpen(false);
  });

  const onSelectItem = (value: string) => {
    setKey(value);
    setOpen(false);
  };

  const options = [
    {
      icon: "FilterAltIcon",
      key: "filter",
      value: `Filter ${valueName}`,
      tooltip: "dataset.filter_labels(field, condition, only_matches=True)",
    },
    {
      icon: "FilterAltOffIcon",
      key: "negativefilter",
      value: `Exclude ${valueName}`,
      tooltip: "dataset.filter_labels(field, condition, only_matches=False)",
    },
    {
      icon: "ImageIcon",
      key: "match",
      value: `Show samples with ${valueName}`,
      tooltip: "dataset.match_labels(fields=field, filter=condition)",
    },
    {
      icon: "HideImageIcon",
      key: "negativeMatch",
      value: `Show samples without ${valueName}`,
      tooltip:
        "dataset.match_labels(fields=field, filter=condition, bool=False)",
    },
  ];
  const selectedValue = options.find((o) => o.key === key)?.value;

  const currentSelection = (
    key: string,
    selectedLabels: string[],
    valueName: string
  ) => {
    // returns the text for selected filter method

    const item = selectedLabels.length > 1 ? valueName + "s" : valueName;
    switch (key) {
      case options[0].key:
        return `Filter ${joinStringArray(selectedLabels)} ${item}`;
      case options[1].key:
        return `Exclude ${joinStringArray(selectedLabels)} ${item}`;
      case options[2].key:
        return `Show samples with ${joinStringArray(selectedLabels)} ${item}`;
      case options[3].key:
        return `Show samples that don't have ${joinStringArray(
          selectedLabels
        )} ${item}`;
      default:
        return key;
    }
  };

  const Selected = () => {
    // render the icon for selected filter method

    const icon = options.find((o) => o.key === key)?.icon;
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
        return <>{selectedValue}</>;
    }
  };

  const children = <Text ref={ref}>{selectedValue}</Text>;

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
        <IconButton onClick={() => setOpen(!open)} sx={{ color: color }}>
          <Selected />
        </IconButton>
        <Tooltip text={currentSelection(key, labels, valueName)}>
          {children}
        </Tooltip>
      </div>
      {open && (
        <Popout style={{ padding: 0 }}>
          {options.map((option: Option) => (
            <Item
              {...option}
              color={color}
              highlightedBGColor={highlightedBGColor}
              onClick={() => onSelectItem(option.key)}
            />
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
  color: string; // icon color
  highlightedBGColor: string; // background color onHover
  onClick: () => void;
};

const Item = React.memo(
  React.forwardRef(
    (
      { icon, value, tooltip, color, highlightedBGColor, onClick }: ItemProp,
      ref
    ) => {
      const StyledPanelItem = styled.div`
        cursor: pointer;
        padding: 4px 8px;
        background-color: ${({ theme }) => theme.background.secondary};
        &:hover {
          background-color: ${({ theme }) => highlightedBGColor};
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
          onClick={onClick}
        >
          <IconButton sx={{ color: color }}>{getIcon(icon!)}</IconButton>

          <Text>{value}</Text>
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
    }
  )
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
        zIndex: "200000",
        right: modal ? 0 : "unset",
        position: "relative",
      }}
    >
      {children}
    </PopoutDiv>
  );
}

const FilterOptionContainer = styled.div`
  position: relative;
`;
