import { coloring, colorScheme, colorSeed } from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";

export default function useColorMappingContext() {
  const currentColorScheme = useRecoilValue(colorScheme);
  const currentColorSeed = useRecoilValue(colorSeed);
  // The app config's colormap: the last fallback for a heatmap's colorscale,
  // and the only one on a dataset with no saved color scheme, whose
  // colorscales carry no server-resolved `rgb`.
  const defaultScale = useRecoilValue(coloring).scale;

  return useMemo(
    () => ({
      colorScheme: currentColorScheme,
      seed: currentColorSeed,
      defaultScale,
    }),
    [currentColorScheme, currentColorSeed, defaultScale],
  );
}
