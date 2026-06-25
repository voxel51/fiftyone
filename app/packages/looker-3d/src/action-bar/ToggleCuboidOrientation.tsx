import { useTheme } from "@fiftyone/components";
import AssistantDirectionIcon from "@mui/icons-material/AssistantDirection";
import type { MouseEvent } from "react";
import { useRecoilState } from "recoil";
import { ActionItem } from "../containers";
import { showCuboidOrientationAtom } from "../state";

export const ToggleCuboidOrientation = () => {
  const [showCuboidOrientation, setShowCuboidOrientation] = useRecoilState(
    showCuboidOrientationAtom
  );
  const { primary } = useTheme();

  return (
    <ActionItem
      title="Toggle Cuboid Orientation"
      data-cy="looker-3d-toggle-cuboid-orientation"
    >
      <AssistantDirectionIcon
        sx={{ fontSize: 24 }}
        style={{
          color: showCuboidOrientation ? primary.main : "inherit",
        }}
        onClick={(e: MouseEvent) => {
          setShowCuboidOrientation((prev) => !prev);
          e.stopPropagation();
          e.preventDefault();
        }}
      />
    </ActionItem>
  );
};
