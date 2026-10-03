import type { MaskTargets } from "@fiftyone/lighter";
import { coloring, colorScheme, colorSeed, targets } from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";

export default function useColorMappingContext() {
  const currentColorScheme = useRecoilValue(colorScheme);
  const currentColorSeed = useRecoilValue(colorSeed);
  // The app config's colormap: the last fallback for a heatmap's colorscale,
  // and the only one on a dataset with no saved color scheme, whose
  // colorscales carry no server-resolved `rgb`.
  const defaultScale = useRecoilValue(coloring).scale;
  // Segmentation coloring is per mask target, so the palette needs the
  // dataset's mask targets alongside the scheme; without them every target
  // paints and an RGB-keyed mask_path decodes as mono.
  const maskTargets = useRecoilValue(targets);

  return useMemo(
    () => ({
      colorScheme: currentColorScheme,
      seed: currentColorSeed,
      defaultScale,
      // `State.Targets` is number-keyed and looker's `IntMaskTargets` is
      // string-keyed; they describe the same JSON, but TypeScript will not
      // relate the two index signatures.
      maskTargets: maskTargets.fields as Record<string, MaskTargets>,
      defaultMaskTargets: maskTargets.defaults as MaskTargets,
    }),
    [currentColorScheme, currentColorSeed, defaultScale, maskTargets],
  );
}
