import React, { PropsWithChildren, useEffect } from "react";
import styled from "styled-components";
import { RecoilState, useRecoilState, useSetRecoilState } from "recoil";
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
import Item from "./FilterItem";
import { Popout } from "@fiftyone/components";

interface Props {
  nestedField: string | undefined; // nested ListFields only ("detections")
  shouldNotShowExclude: boolean; // for BooleanFields
  excludeAtom: RecoilState<boolean>;
  onlyMatchAtom: RecoilState<boolean>;
  isMatchingAtom: RecoilState<boolean>;
  valueName: string;
  color: string;
  modal: boolean;
  path: string;
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
  isLabelTag: boolean,
  isSampleTag: boolean
) => {
  //  feature requirements:
  //  1) only nested ListField items should have the filter and negative filter options;
  //  2) BooleanField should not have the negative filter or negative match options;
  //  3) in expanded mode or keypoints field, do not show the match or negative match options;
  const options: Option[] = [];
  if (nestedField || isLabelTag) {
    options.push({
      icon: "FilterAltIcon",
      key: "filter",
      value: `Select ${nestedField ?? "labels"} with ${
        isLabelTag ? "label tag" : valueName
      }`,
      tooltip: isLabelTag
        ? "dataset.select_labels(tags=expr)"
        : isKeyPointLabel
        ? "dataset.filter_keypoints(field, expr, only_matches=True)"
        : "dataset.filter_labels(field, expr, only_matches=True)",
    });
  }
  if ((nestedField && !shouldNotShowExclude) || isLabelTag) {
    options.push({
      icon: "FilterAltOffIcon",
      key: "negativeFilter",
      value: `Exclude ${nestedField ?? "labels"} with ${
        isLabelTag ? "label tag" : valueName
      }`,
      tooltip: isLabelTag
        ? "dataset.exclude_labels(tags=expr, omit_empty=False)"
        : isKeyPointLabel
        ? "dataset.filter_keypoints(field, ~expr, only_matches=False)"
        : "dataset.filter_labels(field, ~expr, only_matches=False)",
    });
  }
  if (!modal && !isKeyPointLabel) {
    options.push({
      icon: "ImageIcon",
      key: "match",
      value: `Show samples with ${isLabelTag ? "label tag" : valueName}`,
      tooltip: isLabelTag
        ? "dataset.match_labels(tags=expr)"
        : isSampleTag
        ? "dataset.match_tags(expr)"
        : nestedField
        ? "dataset.match_labels(fields=field, filter=expr)"
        : "dataset.match(expr)",
    });
  }
  if (!modal && !shouldNotShowExclude && !isKeyPointLabel) {
    options.push({
      icon: "HideImageIcon",
      key: "negativeMatch",
      value: `Omit samples with ${isLabelTag ? "label tag" : valueName}`,
      tooltip: isLabelTag
        ? "dataset.match_labels(tags=expr, bool=False)"
        : isSampleTag
        ? "dataset.match_tags(expr, bool=False)"
        : nestedField
        ? "dataset.match_labels(fields=field, filter=expr, bool=False)"
        : "dataset.match(~expr)",
    });
  }
  return options;
};

const Text = styled.div`
  font-size: 1rem;
  margin: auto auto auto 5px;
  ${({ theme }) => theme.text.secondary};
`;

const FilterOptionContainer = styled.div`
  position: relative;
  margin: 0 -0.5rem 0 -0.5rem;
`;

const FilterOption: React.FC<Props> = ({
  color,
  path,
  modal,
  isKeyPointLabel,
  valueName,
  nestedField,
  shouldNotShowExclude,
  excludeAtom,
  onlyMatchAtom,
  isMatchingAtom,
}) => {
  const isLabelTag = path?.startsWith("_label_tags");
  const isSampleTag = path?.startsWith("tag");

  const [open, setOpen] = React.useState(false);
  const [excluded, setExcluded] = useRecoilState(excludeAtom);
  const setOnlyMatch = onlyMatchAtom ? useSetRecoilState(onlyMatchAtom) : null;
  const setIsMatching = isMatchingAtom
    ? useSetRecoilState(isMatchingAtom)
    : null;
  const [key, setKey] = React.useState<Key>(() => {
    if (!excluded) {
      return nestedField || isLabelTag ? "filter" : "match";
    } else {
      return nestedField || isLabelTag ? "negativeFilter" : "negativeMatch";
    }
  });

  const theme = useTheme();
  const highlightedBGColor = Color(color).alpha(0.25).string();

  const popoutRef = React.useRef<HTMLDivElement>();
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
    isLabelTag,
    isSampleTag
  );

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
        letterSpacing: "0.1px",
        cursor: "pointer",
      }}
    >
      {selectedValue}
    </Text>
  );

  const FilterMode = styled.div`
    background-color: ${() => theme.background.level3};
    &:hover {
      background-color: ${() =>
        Color(theme.background.level3).alpha(0.5).string()};
    }
    width: 100%;
    display: flex;
    flex-direction: row;
    cursor: pointer;
  `;

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
          <FilterMode onClick={() => setOpen(!open)}>
            <IconButton sx={{ color: color, size: "small" }}>
              <Selected />
            </IconButton>
            <Tooltip
              text={selectedValue ?? ""}
              placement={modal ? "left-start" : "right-start"}
            >
              {children}
            </Tooltip>
          </FilterMode>
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
