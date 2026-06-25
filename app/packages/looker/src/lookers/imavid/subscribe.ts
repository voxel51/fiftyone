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
  // frames painted once (masks render); repainting on loops/re-renders caused flicker
  const paintedFrames = new Set<number>();

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
      // dedup on the stable looker id, not the frame: active fields are looker-level, and keying by frame made every frame repaint all fields
      const newFieldsIfAny = syncAndGetNewLabels(
        id,
        lut,
        new Set(looker.state.options.activePaths)
      );

      // a newly-activated field invalidates every frame's painted state
      if (newFieldsIfAny) {
        paintedFrames.clear();
      }

      if (!paintedFrames.has(newFrameNumber) && newFrameNumber > 0) {
        // first visit: paint labels once (renders masks), then cache so later visits just redraw
        const fieldsToPaint =
          newFieldsIfAny ??
          Array.from(new Set(looker.state.options.activePaths));
        try {
          looker.refreshSample(fieldsToPaint, newFrameNumber);
        } catch (e) {
          console.error("Error refreshing sample", e);
        }
        try {
          looker.refreshOverlaysToCurrentFrame();
        } catch (e) {
          console.error("Error refreshing overlays", e);
        }
        paintedFrames.add(newFrameNumber);
      } else {
        // already painted: just draw this frame's overlays (no full reload)
        looker.refreshOverlaysToCurrentFrame();
      }
    }

    lastSyncKey = syncKey;
  };

  const unsub1 = looker.subscribeToState("currentFrameNumber", subscription);

  return () => {
    unsub1();
  };
};
