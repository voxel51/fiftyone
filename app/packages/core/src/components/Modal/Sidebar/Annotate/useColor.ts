import { useTheme } from "@fiftyone/components";
import type { BaseOverlay } from "@fiftyone/lighter";
import { getOverlayColor } from "@fiftyone/lighter";
import { useMemo } from "react";
import useColorMappingContext from "../../Lighter/useColorMappingContext";

export default function useColor(overlay?: BaseOverlay) {
  const coloring = useColorMappingContext();
  const brand = useTheme().primary.plainColor;

  // `overlay` is mutated in place (e.g. a field move calls `updateField`), so
  // depend on its field too
  const field = overlay?.field;

  return useMemo(() => {
    return overlay ? getOverlayColor(overlay, coloring) : brand;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- field is a recompute trigger for in-place overlay mutation (see above)
  }, [brand, coloring, overlay, field]);
}
