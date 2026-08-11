import * as fos from "@fiftyone/state";
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
  const { data } = useFilterData(modal, path);
  const color = useRecoilValue(fos.pathColor(path));

  // Label fields carry a handful of well-known attributes and stay open.
  // Anything else is an open-ended container whose width nothing bounds — a
  // dynamic embedded document can carry hundreds of fields — so its fields
  // collapse to a browsable list instead.
  const isLabel = fos.useIsLabelPath(path);

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
