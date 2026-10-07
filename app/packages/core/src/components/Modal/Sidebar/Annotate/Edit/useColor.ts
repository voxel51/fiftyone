import { useTheme } from "@fiftyone/components";
import { getLabelColorFromContext } from "@fiftyone/lighter";
import { useMemo } from "react";
import useColorMappingContext from "../../../Lighter/useColorMappingContext";
import { useAnnotationContext } from "./useAnnotationContext";

// any overlay with a field and label: lighter's 2D overlays or the 3D ones
type ColorableOverlay = { field: string; label: unknown };

export default function useColor(overlay?: ColorableOverlay) {
  const coloring = useColorMappingContext();
  const { selected } = useAnnotationContext();
  const refresh = selected?.label;
  const brand = useTheme().primary.plainColor;

  return useMemo(() => {
    refresh;
    // what lighter's getOverlayColor does, without requiring a BaseOverlay
    return overlay
      ? getLabelColorFromContext(overlay.field, overlay.label, coloring)
      : brand;
  }, [brand, coloring, refresh, overlay]);
}
