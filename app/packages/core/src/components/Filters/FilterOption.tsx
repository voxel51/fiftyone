import React, { PropsWithChildren, useEffect } from "react";
import styled from "styled-components";
import { RecoilState, useRecoilState, useRecoilValue } from "recoil";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import ImageIcon from "@mui/icons-material/Image";
import HideImageIcon from "@mui/icons-material/HideImage";
import { IconButton } from "@mui/material";
import { useSpring } from "framer-motion";
import Color from "color";

import { useOutsideClick } from "@fiftyone/state";
import { useTheme } from "@fiftyone/components/src/components/ThemeProvider";
import Tooltip from "@fiftyone/components/src/components/Tooltip";

import { PopoutDiv } from "../utils";
import { joinStringArray } from "./utils";

interface Props {
  shouldShowAllOptions: boolean;
  excludeAtom: RecoilState<boolean>;
  onlyMatchAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  labels: string[];
  valueName: string;
  color: string;
  isRangeLabel?: boolean;
  modal: boolean;
}

const Text = styled.div`
  font-size: 1rem;
  margin: auto auto auto 5px;
  ${({ theme }) => theme.text.secondary};
`;

type Option = {
  key: string;
  value: string;
  icon?: string;
  tooltip: string;
};

const FilterOption: React.FC<Props> = ({
  labels,
  color,
  modal,
  valueName,
  shouldShowAllOptions,
  excludeAtom,
  onlyMatchAtom,
  isMatchingAtom,
  isRangeLabel = false,
}) => {
  const [key, setKey] = React.useState(
    shouldShowAllOptions ? "filter" : "match"
  );
  const [open, setOpen] = React.useState(false);
  const [excluded, setExcluded] = useRecoilState(excludeAtom);
  const [onlyMatch, setOnlyMatch] = useRecoilState(onlyMatchAtom);
  const [isMatching, setIsMatching] = useRecoilState(isMatchingAtom);

  const theme = useTheme();
  const highlightedBGColor = Color(color).alpha(0.25).string();

  const popoutRef = React.useRef();
  const ref = React.useRef();

  useOutsideClick(popoutRef, () => {
    setOpen(false);
  });

  useEffect(() => {
    if (key === "filter") {
      onSelectFilter();
    } else if (key === "negativefilter") {
      onSelectNegativeFilter();
    } else if (key === "match") {
      onSelectMatch();
    } else if (key === "negativeMatch") {
      onSelectNegativeMatch();
    }
  }, [key]);

  // only nested ListField items should have the filter and negative filter options:
  let options = shouldShowAllOptions
    ? [
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
          tooltip:
            "dataset.filter_labels(field, condition, only_matches=False)",
        },
      ]
    : [];

  // label fields in extended view should not have match label (select samples) options
  options = modal
    ? options
    : options.concat([
        {
          icon: "ImageIcon",
          key: "match",
          value: isRangeLabel
            ? `Show samples in the range`
            : `Show samples with ${valueName}`,
          tooltip: "dataset.match_labels(fields=field, filter=condition)",
        },
        {
          icon: "HideImageIcon",
          key: "negativeMatch",
          value: isRangeLabel
            ? `Show samples outside the range`
            : `Show samples without ${valueName}`,
          tooltip:
            "dataset.match_labels(fields=field, filter=condition, bool=False)",
        },
      ]);

  const selectedValue = options.find((o) => o.key === key)?.value;

  const currentSelection = (
    key: string,
    selectedLabels: string[],
    valueName: string
  ) => {
    // returns the text for selected filter method
    const item = selectedLabels.length > 1 ? valueName + "s" : valueName;
    switch (key) {
      case "filter":
        return `Filter ${joinStringArray(selectedLabels)} ${item}`;
      case "negativefilter":
        return `Exclude ${joinStringArray(selectedLabels)} ${item}`;
      case "match":
        return isRangeLabel
          ? `Show samples within the selected range`
          : `Show samples with ${joinStringArray(selectedLabels)} ${item}`;
      case "negativeMatch":
        return isRangeLabel
          ? `Show samples outside the selected range`
          : `Show samples that don't have ${joinStringArray(
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

  const onSelectItem = (key: string) => {
    setKey(key);
    setOpen(false);
  };

  const onSelectFilter = () => {
    setExcluded(false);
    setIsMatching(false);
    setOnlyMatch(true);
  };

  const onSelectNegativeFilter = () => {
    setExcluded(true);
    setIsMatching(false);
    setOnlyMatch(false);
  };

  const onSelectMatch = () => {
    setExcluded(false);
    setIsMatching(true);
    setOnlyMatch(true);
  };

  const onSelectNegativeMatch = () => {
    setExcluded(true);
    setIsMatching(true);
    setOnlyMatch(false);
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
        <Tooltip
          text={currentSelection(key, labels, valueName)}
          placement="right-start"
        >
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
          background-color: ${() => highlightedBGColor};
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
            <Tooltip text={tooltip!} placement="right-start">
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
