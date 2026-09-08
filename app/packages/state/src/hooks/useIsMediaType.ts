import { useRecoilValue } from "recoil";
import { mediaTypeSelector } from "../recoil/selectors";

/**
 * Returns `true` when the current dataset's media type matches the argument.
 *
 * Equality is on the dataset-level `mediaType` (e.g. `"video"`, `"image"`,
 * `"point_cloud"`). For media-family checks like "is 3D", prefer the existing
 * `is3DDataset` selector since it handles multiple matching types.
 */
export const useIsMediaType = (mediaType: string): boolean =>
  useRecoilValue(mediaTypeSelector) === mediaType;

/** Convenience: `useIsMediaType("video")`. */
export const useIsVideo = (): boolean => useIsMediaType("video");
