import { ImaVidLooker, VideoLooker } from "@fiftyone/looker";
import { getSubscription } from "@fiftyone/looker/src/lookers/imavid/subscribe";
import { Lookers, useLookerOptions } from "@fiftyone/state";
import { useEffect, useRef } from "react";
import {
  getColoringKey,
  getOverlays,
  handleNetNewOverlays,
  handlePotentiallyStillPendingOverlays,
  markTheseOverlaysAsPending,
} from "../Grid/useUpdates";
import { useDetectNewActiveLabelFields } from "../Sidebar/useDetectNewActiveLabelFields";

export const useImageModalSelectiveRendering = (
  modalId: string,
  looker: Lookers
) => {
  const { getNewFields } = useDetectNewActiveLabelFields({
    modal: true,
  });

  const id = `${modalId}-${getColoringKey(
    looker.state.options.coloring,
    looker.state.options.colorscale
  )}-image`;

  useEffect(() => {
    if (!looker) {
      return;
    }

    const newFields = getNewFields(id) ?? [];
    const shouldHardReload = Boolean(newFields?.length);

    if (shouldHardReload) {
      const overlays = getOverlays(looker);
      const newOverlays = overlays.filter(
        (o) =>
          o.field &&
          (o.label?.mask_path?.length > 0 ||
            o.label?.map_path?.length > 0 ||
            o.label?.mask ||
            o.label?.map) &&
          newFields.includes(o.field)
      );

      if (newOverlays?.length) {
        markTheseOverlaysAsPending(newOverlays);
      }
      looker?.refreshSample(newFields);
    }

    // so that pending state is percolated to the overlay
    looker.updateOptions({}, shouldHardReload);

    if (shouldHardReload) {
      handleNetNewOverlays(looker, newFields ?? []);
    } else {
      handlePotentiallyStillPendingOverlays(looker);
    }

    looker.updateOptions({}, shouldHardReload);
  }, [id, looker, getNewFields]);
};

export const useImavidModalSelectiveRendering = (
  id: string,
  looker: ImaVidLooker
) => {
  const lookerRef = useRef(looker);
  lookerRef.current = looker;

  const lookerOptions = useLookerOptions(true);

  useEffect(() => {
    const unsub = getSubscription({
      id,
      looker: lookerRef.current,
      modal: true,
    });

    return () => {
      unsub();
    };
  }, [id]);

  useEffect(() => {
    if (!looker) {
      return;
    }

    (looker as ImaVidLooker).pause();
  }, [lookerOptions]);
};

export const useVideoModalSelectiveRendering = (
  id: string,
  looker: VideoLooker
) => {
  const { getNewFields } = useDetectNewActiveLabelFields({
    modal: true,
  });

  const lookerOptions = useLookerOptions(true);

  useEffect(() => {
    if (!looker) {
      return;
    }

    const newFieldsIfAny = getNewFields(id);

    if (newFieldsIfAny) {
      // todo: no granular refreshing for video looker
      // it'd require selective re-processing of frames in the buffer
      looker?.refreshSample();
    }
  }, [id, lookerOptions.activePaths, looker, getNewFields]);
};
