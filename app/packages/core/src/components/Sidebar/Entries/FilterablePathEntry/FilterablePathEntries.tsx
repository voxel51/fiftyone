import * as fos from "@fiftyone/state";
import { pathColor } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import CollapsibleFilterItem from "./CollapsibleFilterItem";
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
  const textFilter = useRecoilValue(fos.textFilter(modal));

  // Children are the only place a nested field is named, so the sidebar's
  // search narrows them too. Shares its rule with the one deciding whether
  // this entry is listed at all, so the two can't disagree.
  const filter = useCallback(
    (childPath: string) =>
      fos.childMatchesTextFilter(
        path,
        childPath.split(".").pop() || "",
        textFilter,
      ),
    [path, textFilter],
  );

  const { data } = useFilterData(modal, path, filter);
  const color = useRecoilValue(pathColor(path));

  // Label fields carry a handful of well-known attributes and stay open.
  // Anything else is an open-ended container whose width we don't control —
  // a projection table can run to hundreds of columns — so its fields
  // collapse to a browsable list instead.
  const isLabel = useRecoilValue(fos.isLabelPath(path));

  return (
    <>
      {data.map(({ color: _, ...props }) => {
        // An unnamed item is the entry's own filter rather than one of its
        // fields, so there is nothing to collapse it under.
        const Item =
          props.named && !isLabel ? CollapsibleFilterItem : FilterItem;

        return <Item key={props.path} color={color} {...events} {...props} />;
      })}
    </>
  );
};

export default FilterablePathEntries;
