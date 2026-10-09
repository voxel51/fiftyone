import { isSidebarFilterMode } from "@fiftyone/state";
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

  const Icon = getIcon(option.icon);
  return <Icon size={14} color={color} style={{ flexShrink: 0 }} />;
};

export default Selected;
