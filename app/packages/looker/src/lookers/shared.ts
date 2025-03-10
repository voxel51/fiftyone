import { ClassificationsOverlay } from "../overlays";
import type { Overlay } from "../overlays/base";
import type {
  BaseState,
  FrameState,
  ImaVidState,
  ImageState,
  VideoState,
} from "../state";

import { zoomToContent } from "../zoom";

import { getColor } from "@fiftyone/utilities";
import _ from "lodash";
import { hasColorChanged } from "../util";

/**
 * Shared util functions used by all lookers
 */
export const LookerUtils = {
  shouldReloadSample: (
    current: Readonly<BaseState["options"]>,
    next: Readonly<Partial<BaseState["options"]>>
  ): boolean => {
    let reloadSample = false;

    if (next.coloring && current.coloring.seed !== next.coloring.seed) {
      reloadSample = true;
    } else if (next.coloring && next.coloring.by !== current.coloring.by) {
      reloadSample = true;
    } else if (!_.isEmpty(_.xor(next.coloring?.pool, current.coloring?.pool))) {
      reloadSample = true;
    } else if (
      hasColorChanged(next.customizeColorSetting, current.customizeColorSetting)
    ) {
      reloadSample = true;
    } else if (
      !_.isEmpty(_.xor(next.selectedLabelTags, current.selectedLabelTags)) ||
      current.selectedLabelTags?.length !== next.selectedLabelTags?.length
    ) {
      reloadSample = true;
    } else if (!_.isEqual(next.labelTagColors, current.labelTagColors)) {
      reloadSample = true;
    } else if (
      next.coloring &&
      hasColorChanged(
        current.coloring.defaultMaskTargetsColors,
        next.coloring.defaultMaskTargetsColors
      )
    ) {
      reloadSample = true;
    } else if (
      !_.isEqual(next.coloring?.scale, current.coloring?.scale) ||
      current.coloring?.scale?.length !== next.coloring?.scale?.length
    ) {
      reloadSample = true;
    }

    return reloadSample;
  },

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
