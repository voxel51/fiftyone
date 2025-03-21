import { getColoringKey } from "@fiftyone/core/src/components/Grid/useUpdates";
import { syncAndGetNewLabels } from "@fiftyone/core/src/components/Sidebar/syncAndGetNewLabels";
import {
  gridActivePathsLUT,
  modalActivePathsLUT,
} from "@fiftyone/core/src/components/Sidebar/useDetectNewActiveLabelFields";
import { ImaVidLooker } from "../..";

export const getSubscription = ({
  id,
  looker,
  modal,
}: {
  id: string;
  looker: ImaVidLooker;
  modal: boolean;
}) => {
  let lastSyncKey: string | null = null;

  const subscription = () => {
    const newFrameNumber = looker.state.currentFrameNumber;

    // LUT id is variable between frames
    const thisFrameLutId = `${id}-${newFrameNumber}-${
      modal ? "modal" : "grid"
    }-${getColoringKey(
      looker.state.options.coloring,
      looker.state.options.colorscale,
      `${id}`
    )}`;

    // sync key is not variable between frames, unlike LUT id
    const syncKey = getColoringKey(
      looker.state.options.coloring,
      looker.state.options.colorscale,
      `${id}-${modal ? "modal" : "grid"}`
    );

    const lut = modal ? modalActivePathsLUT : gridActivePathsLUT;

    // first frame is handled differently
    if (newFrameNumber === 1) {
      if (lastSyncKey !== syncKey) {
        if (!modal) {
          lut.clear();
          looker.frameStoreController.store.resetMasks();
          // we need to reset mask of "default" sample
          looker.refreshSample();
        } else {
          lut.delete(thisFrameLutId);
          looker.frameStoreController.store.resetMaskForFrame(1);
          const newFields = syncAndGetNewLabels(
            id,
            lut,
            new Set(looker.state.options.activePaths)
          );
          looker.refreshSample(newFields, 1);
        }

        lastSyncKey = syncKey;
      }
      if (looker.frameStoreController.store.hasAtLeastOneLoadedMask(1)) {
        lut.delete(thisFrameLutId);
        looker.frameStoreController.store.resetMaskForFrame(1);
        const newFields = syncAndGetNewLabels(
          id,
          lut,
          new Set(looker.state.options.activePaths)
        );
        looker.refreshSample(newFields, 1);
      } else {
        looker.refreshOverlaysToCurrentFrame(true);
      }
      return;
    }

    if (lut.has(thisFrameLutId) && lastSyncKey !== syncKey) {
      lut.delete(thisFrameLutId);
      looker.frameStoreController.store.resetMaskForFrame(newFrameNumber);
    }

    let forceRefresh = false;
    if (lut.has(thisFrameLutId)) {
      if (
        !(modal && newFrameNumber === 1) &&
        looker.frameStoreController.store.hasAtLeastOneLoadedMask(
          newFrameNumber
        )
      ) {
        lut.delete(thisFrameLutId);
        forceRefresh = true;
        looker.frameStoreController.store.resetMaskForFrame(newFrameNumber);
      } else {
        looker.refreshOverlaysToCurrentFrame();
      }
    } else {
      forceRefresh = true;
    }

    if (forceRefresh) {
      const newFieldsIfAny = syncAndGetNewLabels(
        thisFrameLutId,
        lut,
        new Set(looker.state.options.activePaths)
      );

      if (newFieldsIfAny && newFrameNumber > 0) {
        try {
          looker.refreshSample(newFieldsIfAny, newFrameNumber);
        } catch (e) {
          console.error("Error refreshing sample", e);
        }
        try {
          looker.refreshOverlaysToCurrentFrame();
        } catch (e) {
          console.error("Error refreshing overlays", e);
        }
      } else {
        looker.refreshSample();
      }
    }

    lastSyncKey = syncKey;
  };

  const unsub1 = looker.subscribeToState("currentFrameNumber", subscription);

  return () => {
    unsub1();
  };
};
