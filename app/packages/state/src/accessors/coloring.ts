import { useRecoilValue } from "recoil";
import { coloring, colorScheme, pathColor } from "../recoil";

/**
 * The resolved coloring configuration (color-by mode, pool, seed) used to
 * color labels.
 */
export const useColoring = () => useRecoilValue(coloring);

/**
 * The session color scheme (per-field customizations, label tag colors).
 */
export const useColorScheme = () => useRecoilValue(colorScheme);

/**
 * The color assigned to a field path.
 */
export const usePathColor = (path: string) => useRecoilValue(pathColor(path));
