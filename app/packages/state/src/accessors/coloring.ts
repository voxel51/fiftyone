import { useRecoilValue } from "recoil";
import { coloring, colorScheme } from "../recoil";

/**
 * The resolved coloring configuration (color-by mode, pool, seed) used to
 * color labels.
 */
export const useColoring = () => useRecoilValue(coloring);

/**
 * The session color scheme (per-field customizations, label tag colors).
 */
export const useColorScheme = () => useRecoilValue(colorScheme);
