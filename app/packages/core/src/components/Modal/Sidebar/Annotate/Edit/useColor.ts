import { useTheme } from "@fiftyone/components";
import type { BaseOverlay } from "@fiftyone/lighter";
import { getOverlayColor } from "@fiftyone/lighter";
import { useMemo } from "react";
import useColorMappingContext from "../../../Lighter/useColorMappingContext";
import { useAnnotationContext } from "./useAnnotationContext";

export default function useColor(overlay?: BaseOverlay) {
  const coloring = useColorMappingContext();
  const { selected } = useAnnotationContext();
  const refresh = selected?.label;
  const brand = useTheme().primary.plainColor;

  return useMemo(() => {
    refresh;
    return overlay ? getOverlayColor(overlay, coloring) : brand;
  }, [brand, coloring, refresh, overlay]);
}
