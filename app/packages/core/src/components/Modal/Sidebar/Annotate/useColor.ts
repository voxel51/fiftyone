import { useTheme } from "@fiftyone/components";
import type { BaseOverlay } from "@fiftyone/lighter";
import { getOverlayColor } from "@fiftyone/lighter";
import { useMemo } from "react";
import useColorMappingContext from "../../Lighter/useColorMappingContext";

export default function useColor(overlay?: BaseOverlay) {
  const coloring = useColorMappingContext();
  const brand = useTheme().primary.plainColor;

  return useMemo(() => {
    return overlay ? getOverlayColor(overlay, coloring) : brand;
  }, [brand, coloring, overlay]);
}
