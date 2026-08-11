import * as fos from "@fiftyone/state";
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
  const color = fos.usePathColor(path);

  // Label fields carry a handful of well-known attributes and stay open.
  // Every other embedded document collapses, declared or not: nothing bounds
  // how many fields one holds, and collapsing costs a click rather than
  // reachability.
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
