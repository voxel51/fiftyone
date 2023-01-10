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

import { PopoutDiv } from "../../utils";
import { joinStringArray } from "../utils";
import Item from "./FilterItem";

interface Props {
  shouldShowAllOptions: boolean; // nested ListFields only (eg. ground_truth and predictions)
  shouldNotShowExclude: boolean; // for BooleanFields
  excludeAtom: RecoilState<boolean>;
  onlyMatchAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  labels: string[];
  valueName: string;
  color: string;
  isRangeLabel?: boolean;
  modal: boolean;
}

type Option = {
  key: string;
  value: string;
  icon?: string;
  tooltip: string;
};

const generateOptions = (
  shouldShowAllOptions: boolean,
  shouldNotShowExclude: boolean,
  modal: boolean,
  valueName: string,
  isRangeLabel: boolean
) => {
  //  feature requirements:
  //  1) only nested ListField items should have the filter and negative filter options;
  //  2) BooleanField should not have the negative filter or negative match options;
  //  3) in expanded mode, do not show the match or negative match options;

  const options: Option[] = [];
  if (shouldShowAllOptions) {
    options.push({
      icon: "FilterAltIcon",
      key: "filter",
      value: `Filter ${valueName}`,
      tooltip: "dataset.filter_labels(field, condition, only_matches=True)",
    });
  }
  if (shouldShowAllOptions && !shouldNotShowExclude) {
    options.push({
      icon: "FilterAltOffIcon",
      key: "negativefilter",
      value: `Exclude ${valueName}`,
      tooltip: "dataset.filter_labels(field, condition, only_matches=False)",
    });
  }
  if (!modal) {
    options.push({
      icon: "ImageIcon",
      key: "match",
      value: isRangeLabel
        ? `Show samples in the range`
        : `Show samples with ${valueName}`,
      tooltip: shouldShowAllOptions
        ? "dataset.match_labels(fields=field, filter=condition)"
        : "dataset.match(F(field).filter(condition).length() > 0)",
    });
  }
  if (!modal && !shouldNotShowExclude) {
    options.push({
      icon: "HideImageIcon",
      key: "negativeMatch",
      value: isRangeLabel
        ? `Show samples outside the range`
        : `Show samples without ${valueName}`,
      tooltip: shouldShowAllOptions
        ? "dataset.match_labels(fields=field, filter=condition, bool=False)"
        : "dataset.match(F(field).filter(condition).length() == 0)",
    });
  }
  return options;
};

const currentSelection = (
  key: string,
  selectedLabels: string[],
  valueName: string,
  isRangeLabel: boolean
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

const Text = styled.div`
  font-size: 1rem;
  margin: auto auto auto 5px;
  ${({ theme }) => theme.text.secondary};
`;

const FilterOptionContainer = styled.div`
  position: relative;
`;

const FilterOption: React.FC<Props> = ({
  labels,
  color,
  modal,
  valueName,
  shouldShowAllOptions,
  shouldNotShowExclude,
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

  const options = generateOptions(
    shouldShowAllOptions,
    shouldNotShowExclude,
    modal,
    valueName,
    Boolean(isRangeLabel)
  );
  if (options.length === 1) return <></>;

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

  const selectedValue = options.find((o) => o.key === key)?.value;

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
    setExcluded && setExcluded(false);
    setIsMatching && setIsMatching(false);
    setOnlyMatch && setOnlyMatch(true);
  };

  const onSelectNegativeFilter = () => {
    setExcluded && setExcluded(true);
    setIsMatching && setIsMatching(false);
    setOnlyMatch && setOnlyMatch(false);
  };

  const onSelectMatch = () => {
    setExcluded && setExcluded(false);
    setIsMatching && setIsMatching(true);
    setOnlyMatch && setOnlyMatch(true);
  };

  const onSelectNegativeMatch = () => {
    setExcluded && setExcluded(true);
    setIsMatching && setIsMatching(true);
    setOnlyMatch && setOnlyMatch(true);
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
          text={currentSelection(key, labels, valueName, Boolean(isRangeLabel))}
          placement="right-start"
        >
          {children}
        </Tooltip>
      </div>
      {open && (
        <Popout style={{ padding: 0, position: "relative" }}>
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
      }}
    >
      {children}
    </PopoutDiv>
  );
}
