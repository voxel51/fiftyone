import { isSidebarFilterMode } from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { getIcon } from "./FilterItem";
import { Option, OptionKey } from "./useOptions";

const Selected = ({
  filterKey,
  options,
  visibilityKey,
}: {
  filterKey: OptionKey;
  options: Option[];
  visibilityKey: OptionKey;
}) => {
  // render the icon for selected filter method

  const isFilterMode = useRecoilValue(isSidebarFilterMode);
  const icon = options.find(
    (o) => o.key === (isFilterMode ? filterKey : visibilityKey)
  )?.icon;
  if (!icon) return <>{isFilterMode ? filterKey : visibilityKey}</>;

  return getIcon(icon);
};

export default Selected;
