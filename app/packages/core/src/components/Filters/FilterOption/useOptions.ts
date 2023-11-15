import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { isBooleanField, isInKeypointsField, isInListField } from "../state";

export type OptionKey =
  | "filter"
  | "negativeFilter"
  | "match"
  | "negativeMatch"
  | "visible"
  | "notVisible";

export type Option = {
  key: OptionKey;
  value: string;
  icon?: string;
  tooltip: string;
};

export default function (modal: boolean, path: string) {
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const isBoolean = useRecoilValue(isBooleanField(path));
  const isKeypoints = useRecoilValue(isInKeypointsField(path));
  const isList = useRecoilValue(isInListField(path));

  return useMemo(() => {
    //  feature requirements:
    //  1) only list field items should have the filter and negative filter
    //     options
    //  2) boolean fields should not have the negative filter or negative match
    //     options
    //  3) in expanded mode or keypoints fields, do not show the match or
    //     negative match options

    const isLabelTag = path === "_label_tags";
    const isSampleTag = path === "tags";
    const name = isLabelTag ? "tags" : path.split(".").slice(-1)[0];
    const listName = isLabelTag
      ? "labels"
      : isList
      ? path.split(".").slice(-2)[0]
      : null;

    const options: Option[] = [];
    if (!isFilterMode) {
      options.push({
        icon: "VisibilityIcon",
        key: "visible",
        value: `Show ${name} 
        `,
        tooltip: "",
      });
      options.push({
        icon: "VisibilityOffIcon",
        key: "notVisible",
        value: `Hide ${name}`,
        tooltip: "",
      });
      return options;
    }

    if (listName) {
      options.push({
        icon: "FilterAltIcon",
        key: "filter",
        value: modal
          ? `Show  ${listName ?? "labels"}`
          : `Select ${listName ?? "labels"} with ${name}`,
        tooltip: isLabelTag
          ? "dataset.select_labels(tags=expr)"
          : isKeypoints
          ? "dataset.filter_keypoints(field, expr, only_matches=True)"
          : "dataset.filter_labels(field, expr, only_matches=True)",
      });
    }

    if (listName && !isBoolean) {
      options.push({
        icon: "FilterAltOffIcon",
        key: "negativeFilter",
        value: modal ? `Hide ${listName}` : `Exclude ${listName} with ${name}`,
        tooltip: isLabelTag
          ? "dataset.exclude_labels(tags=expr, omit_empty=False)"
          : isKeypoints
          ? "dataset.filter_keypoints(field, ~expr, only_matches=False)"
          : "dataset.filter_labels(field, ~expr, only_matches=False)",
      });
    }

    if (!modal && !isKeypoints) {
      options.push({
        icon: "ImageIcon",
        key: "match",
        value: `Show samples with ${name}`,
        tooltip: isLabelTag
          ? "dataset.match_labels(tags=expr)"
          : isSampleTag
          ? "dataset.match_tags(expr)"
          : isList
          ? "dataset.match_labels(fields=field, filter=expr)"
          : "dataset.match(expr)",
      });
    }

    if (!modal && !isBoolean && !isKeypoints) {
      options.push({
        icon: "HideImageIcon",
        key: "negativeMatch",
        value: `Omit samples with ${name}`,
        tooltip: isLabelTag
          ? "dataset.match_labels(tags=expr, bool=False)"
          : isSampleTag
          ? "dataset.match_tags(expr, bool=False)"
          : isList
          ? "dataset.match_labels(fields=field, filter=expr, bool=False)"
          : "dataset.match(~expr)",
      });
    }

    return options;
  }, [isFilterMode, isBoolean, isKeypoints, isList, modal, path]);
}
