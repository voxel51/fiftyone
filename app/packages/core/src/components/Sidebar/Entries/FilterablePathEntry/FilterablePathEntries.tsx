import { pathColor } from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";
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
  const color = useReverbValue(pathColor(path));

  return (
    <>
      {data.map(({ color: _, ...props }) => (
        <FilterItem key={props.path} color={color} {...events} {...props} />
      ))}
    </>
  );
};

export default FilterablePathEntries;
