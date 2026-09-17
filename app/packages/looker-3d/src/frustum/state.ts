/**
 * Recoil state atoms for camera frustum visualization.
 */

import { getBrowserStorageEffectForKey } from "@fiftyone/state/src/atoms/customEffects";
import { atom } from "@fiftyone/reverb";

/**
 * Global toggle for frustum visibility.
 * When false, no frustums are rendered.
 * Persisted in browser storage.
 */
export const frustumsVisibleAtom = atom<boolean>({
  key: "fo3d-frustumsVisible",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-frustumsVisible", {
      valueClass: "boolean",
    }),
  ],
});
