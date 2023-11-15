import { isSidebarFilterMode } from "@fiftyone/state";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import HideImageIcon from "@mui/icons-material/HideImage";
import ImageIcon from "@mui/icons-material/Image";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useRecoilValue } from "recoil";
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

  switch (icon.toLowerCase()) {
    case "filteralticon":
      return <FilterAltIcon fontSize="small" />;
    case "filteraltofficon":
      return <FilterAltOffIcon fontSize="small" />;
    case "imageicon":
      return <ImageIcon fontSize="small" />;
    case "hideimageicon":
      return <HideImageIcon fontSize="small" />;
    case "visibilityicon":
      return <VisibilityIcon fontSize="small" />;
    case "visibilityofficon":
      return <VisibilityOffIcon fontSize="small" />;
    default:
      throw new Error(`no icon ${icon}`);
  }
};

export default Selected;
