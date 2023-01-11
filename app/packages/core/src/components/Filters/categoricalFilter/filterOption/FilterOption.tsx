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

import { PopoutDiv } from "../../../utils";
import { joinStringArray } from "../../utils";
import Item from "./FilterItem";

interface Props {
  nestedField: string | undefined; // nested ListFields only ("detections")
  shouldNotShowExclude: boolean; // for BooleanFields
  excludeAtom: RecoilState<boolean>;
  onlyMatchAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  labels: string[];
  valueName: string;
  color: string;
  isRangeLabel?: boolean;
  modal: boolean;
  isKeyPointLabel: boolean;
}

type Option = {
  key: string;
  value: string;
  icon?: string;
  tooltip: string;
};

type Key = "filter" | "negativeFilter" | "match" | "negativeMatch";

const generateOptions = (
  nestedField: string | undefined,
  shouldNotShowExclude: boolean,
  modal: boolean,
  isKeyPointLabel: boolean,
  valueName: string,
  isRangeLabel: boolean
) => {
  //  feature requirements:
  //  1) only nested ListField items should have the filter and negative filter options;
  //  2) BooleanField should not have the negative filter or negative match options;
  //  3) in expanded mode or keypoints field, do not show the match or negative match options;

  const options: Option[] = [];
  if (Boolean(nestedField)) {
    options.push({
      icon: "FilterAltIcon",
      key: "filter",
      value: isRangeLabel
        ? `Select ${nestedField} within range`
        : `Select ${nestedField} with ${valueName}`,
      tooltip: "dataset.filter_labels(field, expr, only_matches=True)",
    });
  }
  if (Boolean(nestedField) && !shouldNotShowExclude) {
    options.push({
      icon: "FilterAltOffIcon",
      key: "negativeFilter",
      value: isRangeLabel
        ? `Exclude ${nestedField} within range`
        : `Exclude ${nestedField} with ${valueName}`,
      tooltip: "dataset.filter_labels(field, ~expr, only_matches=False)",
    });
  }
  if (!modal && !isKeyPointLabel) {
    options.push({
      icon: "ImageIcon",
      key: "match",
      value: isRangeLabel
        ? `Show samples in the range`
        : `Show samples with ${valueName}`,
      tooltip: Boolean(nestedField)
        ? "dataset.match_labels(fields=field, filter=expr)"
        : "dataset.match(F(field).filter(expr).length() > 0)",
    });
  }
  if (!modal && !shouldNotShowExclude && !isKeyPointLabel) {
    options.push({
      icon: "HideImageIcon",
      key: "negativeMatch",
      value: isRangeLabel
        ? `Omit samples in the range`
        : `Omit samples with ${valueName}`,
      tooltip: Boolean(nestedField)
        ? "dataset.match_labels(fields=field, filter=expr, bool=False)"
        : "dataset.match(F(field).filter(expr).length() == 0)",
    });
  }
  return options;
};

const currentSelection = (
  key: Key,
  selectedLabels: string[],
  nestedField: string | undefined,
  valueName: string,
  isRangeLabel: boolean
) => {
  // returns the text for selected filter method
  const item = selectedLabels.length > 1 ? valueName + "s" : valueName;
  switch (key) {
    case "filter":
      return `Filter ${nestedField} by ${joinStringArray(
        selectedLabels
      )} ${item}, filter samples`;
    case "negativeFilter":
      return `Exclude ${nestedField} by ${joinStringArray(
        selectedLabels
      )} ${item}`;
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
  cursor: pointer, ${({ theme }) => theme.text.secondary};
`;

const FilterOptionContainer = styled.div`
  position: relative;
`;

const FilterOption: React.FC<Props> = ({
  labels,
  color,
  modal,
  isKeyPointLabel,
  valueName,
  nestedField,
  shouldNotShowExclude,
  excludeAtom,
  onlyMatchAtom,
  isMatchingAtom,
  isRangeLabel = false,
}) => {
  const [key, setKey] = React.useState<Key | null>(null);

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
  const options = generateOptions(
    nestedField,
    shouldNotShowExclude,
    modal,
    isKeyPointLabel,
    valueName,
    Boolean(isRangeLabel)
  );

  useEffect(() => {
    // on initial load, if filter already exists, load exisiting filter for modal filters
    // otherwise, show defaults: filter for nested listfield, match for other fields
    if (key === null) {
      if (isMatching && !excluded) {
        Boolean(nestedField) ? setKey("filter") : setKey("match");
      }
      if (isMatching && excluded) {
        Boolean(nestedField)
          ? setKey("negativeFilter")
          : setKey("negativeMatch");
      }
      if (!isMatching && !excluded) {
        setKey("filter");
      }
      if (!isMatching && excluded) {
        setKey("negativeFilter");
      }
    }
  }, []);

  useEffect(() => {
    if (key === "filter") {
      onSelectFilter();
    } else if (key === "negativeFilter") {
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
        return <FilterAltIcon fontSize="small" />;
      case "filteraltofficon":
        return <FilterAltOffIcon fontSize="small" />;
      case "imageicon":
        return <ImageIcon fontSize="small" />;
      case "hideimageicon":
        return <HideImageIcon fontSize="small" />;
      default:
        return <>{selectedValue}</>;
    }
  };

  const onSelectItem = (key: Key) => {
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

  const children = (
    <Text
      ref={ref}
      onClick={() => setOpen(!open)}
      style={{
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        overflow: "hidden",
      }}
    >
      {selectedValue}
    </Text>
  );

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
        {options.length > 1 && (
          <>
            <IconButton
              onClick={() => setOpen(!open)}
              sx={{ color: color, size: "small" }}
            >
              <Selected />
            </IconButton>
            <Tooltip
              text={currentSelection(
                key as Key,
                labels,
                nestedField,
                valueName,
                Boolean(isRangeLabel)
              )}
              placement="right-start"
            >
              {children}
            </Tooltip>
          </>
        )}
      </div>
      {open && (
        <Popout style={{ padding: 0, position: "relative" }}>
          {options.map((option: Option) => (
            <Item
              {...option}
              color={color}
              highlightedBGColor={highlightedBGColor}
              onClick={() => onSelectItem(option.key as Key)}
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
