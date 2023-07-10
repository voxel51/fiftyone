import { useTheme } from "@fiftyone/components/src/components/ThemeProvider";
import Tooltip from "@fiftyone/components/src/components/Tooltip";
import * as fos from "@fiftyone/state";
import { useOutsideClick } from "@fiftyone/state";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import HideImageIcon from "@mui/icons-material/HideImage";
import ImageIcon from "@mui/icons-material/Image";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { IconButton } from "@mui/material";
import Color from "color";
import React, { useEffect, useMemo } from "react";
import {
  RecoilState,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";

import { Popout } from "@fiftyone/components";
import Item from "./FilterItem";
import { set } from "lodash";
import { fieldVisibility } from "@fiftyone/state/src/recoil/fieldVisibility";

interface Props {
  nestedField: string | undefined; // nested ListFields only ("detections")
  shouldNotShowExclude: boolean; // for BooleanFields
  excludeAtom: RecoilState<boolean>;
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

type Key =
  | "filter"
  | "negativeFilter"
  | "match"
  | "negativeMatch"
  | "visible"
  | "notVisible";

const generateOptions = (
  isFilterMode: boolean,
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
  if (!isFilterMode) {
    options.push({
      icon: "VisibilityIcon",
      key: "visible",
      value: `Show ${isLabelTag ? "label tags" : valueName} 
      `,
      tooltip: "",
    });
    options.push({
      icon: "VisibilityOffIcon",
      key: "notVisible",
      value: `Hide ${isLabelTag ? "label tags" : valueName}`,
      tooltip: "",
    });
    return options;
  }

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
  isMatchingAtom,
}) => {
  const isLabelTag = path?.startsWith("_label_tags");
  const isSampleTag = path?.startsWith("tag");
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const [open, setOpen] = React.useState(false);
  const [excluded, setExcluded] = useRecoilState(excludeAtom);
  const [isMatching, setIsMatching] = useRecoilState(isMatchingAtom);
  const visibility = useRecoilValue(fieldVisibility);
  const filter = useRecoilValue(fos.filters);

  const [key, setKey] = React.useState<Key>(() => {
    return isFilterMode
      ? !excluded
        ? nestedField || isLabelTag
          ? "filter"
          : "match"
        : nestedField || isLabelTag
        ? "negativeFilter"
        : "negativeMatch"
      : !excluded
      ? "visible"
      : "notVisible";
  });

  const theme = useTheme();
  const highlightedBGColor = Color(color).alpha(0.25).string();

  const popoutRef = React.useRef<HTMLDivElement>();
  const ref = React.useRef();

  useOutsideClick(popoutRef, () => {
    setOpen(false);
  });

  const options = useMemo(
    () =>
      generateOptions(
        isFilterMode,
        nestedField,
        shouldNotShowExclude,
        modal,
        isKeyPointLabel,
        valueName,
        isLabelTag,
        isSampleTag
      ),
    [
      isFilterMode,
      modal,
      isLabelTag,
      isSampleTag,
      nestedField,
      shouldNotShowExclude,
      isKeyPointLabel,
      valueName,
    ]
  );

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
      case "visibilityicon":
        return <VisibilityIcon fontSize="small" />;
      case "visibilityofficon":
        return <VisibilityOffIcon fontSize="small" />;
      default:
        return <>{selectedValue}</>;
    }
  };

  const onSelectItem = (key: Key) => {
    setKey(key);
    setOpen(false);
    switch (key) {
      case "filter":
        onSelectFilter();
        break;
      case "negativeFilter":
        onSelectNegativeFilter();
        break;
      case "match":
        onSelectMatch();
        break;
      case "negativeMatch":
        onSelectNegativeMatch();
        break;
      case "visible":
        onSelectVisible();
        break;
      case "notVisible":
        onSelectNotVisible();
        break;
    }
  };

  const onSelectFilter = () => {
    excluded && setExcluded(false);
    isMatching && setIsMatching(false);
  };

  const onSelectNegativeFilter = () => {
    setExcluded && setExcluded(true);
    setIsMatching && setIsMatching(false);
  };

  const onSelectMatch = () => {
    setExcluded && setExcluded(false);
    setIsMatching && setIsMatching(true);
  };

  const onSelectNegativeMatch = () => {
    setExcluded && setExcluded(true);
    setIsMatching && setIsMatching(true);
  };

  useEffect(() => {
    // when swtiching the mode, update the key to reflect the current mode selection
    if (isFilterMode && ["visible", "notVisible"].includes(key)) {
      const negative = filter[path]?.exclude;
      const matchMode = filter[path]?.isMatching;
      if (!negative && matchMode) {
        setKey("match");
      }
      if (negative && matchMode) {
        setKey("negativeMatch");
      }
      if (!negative && !matchMode) {
        setKey("filter");
      }
      if (negative && !matchMode) {
        setKey("negativeFilter");
      }
    }
    if (
      !isFilterMode &&
      ["filter", "negativeFilter", "match", "negativeMatch"].includes(key)
    ) {
      const negative = visibility[path]?.exclude;
      if (!negative) {
        setKey("visible");
      } else {
        setKey("notVisible");
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilterMode]);

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
