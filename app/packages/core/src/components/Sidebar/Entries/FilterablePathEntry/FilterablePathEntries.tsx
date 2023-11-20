import React from "react";
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
  return (
    <>
      {data.map((props) => (
        <FilterItem key={props.path} {...events} {...props} />
      ))}
    </>
  );
};

export default FilterablePathEntries;
