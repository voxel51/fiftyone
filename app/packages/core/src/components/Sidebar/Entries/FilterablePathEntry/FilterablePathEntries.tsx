import { pathColor } from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import FilterItem from "./FilterItem";
import useFilterData from "./useFilterData";

const FilterablePathEntries = ({
  modal,
  path,
  ...events
}: {
  modal: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  path: string;
}) => {
  const { data } = useFilterData(modal, path);
  const color = useRecoilValue(pathColor(path));

  return (
    <>
      {data.map(({ color: _, ...props }) => (
        <FilterItem key={props.path} color={color} {...events} {...props} />
      ))}
    </>
  );
};

export default FilterablePathEntries;
