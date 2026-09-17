import { colorScheme, colorSeed } from "@fiftyone/state";
import { useMemo } from "react";
import { useReverbValue } from "@fiftyone/reverb";

export default function useColorMappingContext() {
  const currentColorScheme = useReverbValue(colorScheme);
  const currentColorSeed = useReverbValue(colorSeed);
  return useMemo(
    () => ({
      colorScheme: currentColorScheme,
      seed: currentColorSeed,
    }),
    [currentColorScheme, currentColorSeed],
  );
}
