import { isSidebarFilterMode } from "@fiftyone/state";
import { IconAction, Size } from "@voxel51/voodo";
import { useReverbValue } from "@fiftyone/reverb";
import { getIcon } from "./FilterItem";
import { Option, OptionKey } from "./useOptions";

const Selected = ({
  color,
  filterKey,
  options,
  visibilityKey,
}: {
  color: string;
  filterKey: OptionKey;
  options: Option[];
  visibilityKey: OptionKey;
}) => {
  // render the icon for selected filter method

  const isFilterMode = useReverbValue(isSidebarFilterMode);
  const option = options.find(
    (o) => o.key === (isFilterMode ? filterKey : visibilityKey),
  );
  if (!option?.icon) return <>{isFilterMode ? filterKey : visibilityKey}</>;

  return (
    <IconAction
      icon={getIcon(option.icon)}
      size={Size.Lg}
      aria-label={option.value}
      style={{ color }}
    />
  );
};

export default Selected;
