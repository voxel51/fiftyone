import { useTheme } from "@fiftyone/components";
import TextRotationAngleupIcon from "@mui/icons-material/TextRotationAngleup";
import { IconButton } from "@mui/material";
import type { MouseEvent } from "react";
import { ActionItem } from "../containers";
import { useCuboidOrientationState } from "../state";

export const ToggleCuboidOrientation = () => {
  const [showCuboidOrientation, setShowCuboidOrientation] =
    useCuboidOrientationState();
  const { primary } = useTheme();

  return (
    <ActionItem
      title="Toggle Cuboid Orientation"
      data-cy="looker-3d-toggle-cuboid-orientation"
    >
      <IconButton
        aria-label="Toggle cuboid orientation"
        aria-pressed={showCuboidOrientation}
        size="small"
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          setShowCuboidOrientation((prev) => !prev);
          e.stopPropagation();
          e.preventDefault();
        }}
        sx={{
          color: showCuboidOrientation ? primary.main : "inherit",
          padding: 0,
        }}
      >
        <TextRotationAngleupIcon sx={{ fontSize: 24 }} />
      </IconButton>
    </ActionItem>
  );
};
