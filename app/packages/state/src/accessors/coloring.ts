import { useReverbValue } from "@fiftyone/reverb";
import { coloring, colorScheme } from "../atoms";

/**
 * The resolved coloring configuration (color-by mode, pool, seed) used to
 * color labels.
 */
export const useColoring = () => useReverbValue(coloring);

/**
 * The session color scheme (per-field customizations, label tag colors).
 */
export const useColorScheme = () => useReverbValue(colorScheme);
