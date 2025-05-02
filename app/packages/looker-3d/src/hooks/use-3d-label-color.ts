import { useMemo } from "react";
import {
  LABEL_3D_HOVERED_AND_SELECTED_COLOR,
  LABEL_3D_HOVERED_COLOR,
  LABEL_3D_INSTANCE_HOVERED_COLOR,
  LABEL_3D_SIMILAR_SELECTED_COLOR,
} from "../constants";

export const use3dLabelColor = ({
  isSelected,
  isHovered,
  isSimilarLabelHovered,
  defaultColor,
}: {
  isSelected: boolean;
  isHovered: boolean;
  isSimilarLabelHovered: boolean;
  defaultColor: string;
}) => {
  return useMemo(() => {
    const isAnyHovered = isHovered || isSimilarLabelHovered;

    if (isAnyHovered && isSelected) return LABEL_3D_HOVERED_AND_SELECTED_COLOR;

    if (isSelected) return LABEL_3D_SIMILAR_SELECTED_COLOR;
    if (isSimilarLabelHovered) return LABEL_3D_INSTANCE_HOVERED_COLOR;
    if (isHovered) return LABEL_3D_HOVERED_COLOR;
    return defaultColor;
  }, [isSelected, isHovered, isSimilarLabelHovered, defaultColor]);
};
