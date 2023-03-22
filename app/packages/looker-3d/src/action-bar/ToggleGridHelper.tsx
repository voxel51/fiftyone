import { useTheme } from "@fiftyone/components";
import GridOnIcon from "@mui/icons-material/GridOn";
import * as recoil from "recoil";
import { ActionItem } from "../containers";
import { isGridOnAtom } from "../state";

export const ToggleGridHelper = () => {
  const [isGridOn, setIsGridOn] = recoil.useRecoilState(isGridOnAtom);
  const { primary } = useTheme();

  return (
    <ActionItem title="Toggle Grid">
      <GridOnIcon
        sx={{ fontSize: 24 }}
        style={{
          color: isGridOn ? primary.main : "inherit",
        }}
        onClick={(e) => {
          setIsGridOn((prev) => !prev);
          e.stopPropagation();
          e.preventDefault();
        }}
      />
    </ActionItem>
  );
};
