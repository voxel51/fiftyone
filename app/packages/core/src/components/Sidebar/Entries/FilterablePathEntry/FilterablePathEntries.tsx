import { pathColor } from "@fiftyone/state";
import React, { useEffect } from "react";
import { useRecoilValue } from "recoil";
import FilterItem from "./FilterItem";
import useFilterData from "./useFilterData";

const TIMEOUT = 0;

class QueryPerformanceToast extends Event {
  path?: string;
  constructor(path?: string) {
    super("queryperformance");
    this.path = path;
  }
}

const QueryPerformanceDispatcher = ({ path }: { path: string }) => {
  useEffect(() => {
    const timeout = setTimeout(() => {
      window.dispatchEvent(new QueryPerformanceToast(path));
    }, TIMEOUT);

    return () => clearTimeout(timeout);
  }, [path]);
  return null;
};

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
