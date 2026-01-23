import { useTheme } from "@fiftyone/components";
import VideocamIcon from "@mui/icons-material/Videocam";
import type { MouseEvent } from "react";
import { ActionItem } from "../containers";
import { useFrustumActions, useFrustums } from "../frustum";

export const ToggleFrustums = () => {
  const { isVisible } = useFrustums();
  const { toggle } = useFrustumActions();
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
