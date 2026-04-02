import { useTheme } from "@fiftyone/components";
import type { BaseOverlay } from "@fiftyone/lighter";
import { getOverlayColor } from "@fiftyone/lighter";
import { useMemo } from "react";
import useColorMappingContext from "../../../Lighter/useColorMappingContext";
import { useEditingLabel } from "../redux/hooks";

export default function useColor(overlay?: BaseOverlay | null) {
  const coloring = useColorMappingContext();
  const editingLabel = useEditingLabel(); // refresh trigger
  const brand = useTheme().primary.plainColor;

  return useMemo(() => {
    editingLabel; // referenced for dependency tracking
    return overlay ? getOverlayColor(overlay, coloring) : brand;
  }, [brand, coloring, editingLabel, overlay]);
}
