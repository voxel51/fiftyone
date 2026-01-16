import { useTheme } from "@fiftyone/components";
import VideocamIcon from "@mui/icons-material/Videocam";
import type { MouseEvent } from "react";
import { ActionItem } from "../containers";
import { useToggleFrustums } from "../frustum/hooks";

export const ToggleFrustums = () => {
  const { isVisible, toggle } = useToggleFrustums();
  const { primary } = useTheme();

  return (
    <ActionItem title="Toggle Camera Frustums (F)">
      <VideocamIcon
        sx={{ fontSize: 24 }}
        style={{
          color: isVisible ? primary.main : "inherit",
        }}
        onClick={(e: MouseEvent) => {
          toggle();
          e.stopPropagation();
          e.preventDefault();
        }}
      />
    </ActionItem>
  );
};
