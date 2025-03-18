import { ClassificationsOverlay } from "../overlays";
import type { Overlay } from "../overlays/base";
import type { FrameState, ImaVidState, ImageState, VideoState } from "../state";

import { zoomToContent } from "../zoom";

import { getColor } from "@fiftyone/utilities";

/**
 * Shared util functions used by all lookers
 */
export const LookerUtils = {
  toggleZoom: <
    State extends FrameState | ImageState | VideoState | ImaVidState
  >(
    state: State,
    overlays: Overlay<State>[]
  ) => {
    if (state.options.selectedLabels) {
      const ids = new Set(state.options.selectedLabels);
      const selected = overlays.filter((o) => {
        if (o instanceof ClassificationsOverlay) {
          return false;
        }

        return ids.has(o.getSelectData(state).id);
      });

      if (selected.length) {
        overlays = selected;
      }
    }
    const { pan, scale } = zoomToContent(state, overlays);

    if (
      state.pan[0] === pan[0] &&
      state.pan[1] === pan[1] &&
      state.scale === scale
    ) {
      state.pan = [0, 0];
      state.scale = 1;
    } else {
      state.pan = pan;
      state.scale = scale;
    }

    state.zoomToContent = false;
  },

  workerCallbacks: {
    requestColor: [
      (worker, { key, pool, seed }) => {
        worker.postMessage({
          method: "resolveColor",
          key,
          seed,
          color: getColor(pool, seed, key),
        });
      },
    ],
  },
};

export const withFrames = <T extends { [key: string]: unknown }>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => ["frames." + k, v])
  ) as T;
