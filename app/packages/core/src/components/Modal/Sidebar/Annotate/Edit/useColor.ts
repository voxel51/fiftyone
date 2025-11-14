import { useTheme } from "@fiftyone/components";
import type { BaseOverlay } from "@fiftyone/lighter";
import { getOverlayColor } from "@fiftyone/lighter";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import useColorMappingContext from "../../../Lighter/useColorMappingContext";
import { current } from "./state";

export default function useColor(overlay?: BaseOverlay) {
  const coloring = useColorMappingContext();
  const refresh = useAtomValue(current);
  const brand = useTheme().primary.plainColor;

  return useMemo(() => {
    refresh;
    return overlay ? getOverlayColor(overlay, coloring) : brand;
  }, [brand, coloring, refresh, overlay]);
}
