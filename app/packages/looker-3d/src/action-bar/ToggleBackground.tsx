import { useTheme } from "@fiftyone/components";
import WallpaperIcon from "@mui/icons-material/Wallpaper";
import * as recoil from "recoil";
import { ActionItem } from "../containers";
import { isFo3dBackgroundOnAtom } from "../state";

export const ToggleFo3dBackground = () => {
  const [isBackgroundOn, setIsBackgroundOn] = recoil.useRecoilState(
    isFo3dBackgroundOnAtom
  );
  const { primary } = useTheme();

  return (
    <ActionItem title="Toggle Background">
      <WallpaperIcon
        sx={{ fontSize: 24 }}
        style={{
          color: isBackgroundOn ? primary.main : "inherit",
        }}
        onClick={(e) => {
          setIsBackgroundOn((prev) => !prev);
          e.stopPropagation();
          e.preventDefault();
        }}
      />
    </ActionItem>
  );
};
