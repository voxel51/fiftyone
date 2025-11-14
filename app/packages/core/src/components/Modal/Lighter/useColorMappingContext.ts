import { colorScheme, colorSeed } from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";

export default function useColorMappingContext() {
  const currentColorScheme = useRecoilValue(colorScheme);
  const currentColorSeed = useRecoilValue(colorSeed);
  return useMemo(
    () => ({
      colorScheme: currentColorScheme,
      seed: currentColorSeed,
    }),
    [currentColorScheme, currentColorSeed]
  );
}
