import { ImaVidLooker, VideoLooker } from "@fiftyone/looker";
import { Lookers, useLookerOptions } from "@fiftyone/state";
import { useEffect } from "react";
import { useDetectNewActiveLabelFields } from "../Sidebar/useDetectNewActiveLabelFields";

export const useImageModalSelectiveRendering = (
  id: string,
  looker: Lookers
) => {
  const lookerOptions = useLookerOptions(true);

  const { getNewFields } = useDetectNewActiveLabelFields({
    modal: true,
  });

  useEffect(() => {
    if (!looker) {
      return;
    }

    const newFieldsIfAny = getNewFields(id);

    if (newFieldsIfAny) {
      looker?.refreshSample(newFieldsIfAny);
    }
  }, [id, lookerOptions.activePaths, looker]);
};

export const useImavidModalSelectiveRendering = (
  id: string,
  looker: ImaVidLooker
) => {
  const { getNewFields } = useDetectNewActiveLabelFields({
    modal: true,
  });

  // this is for default view
  // subscription below will not have triggered for the first frame
  useImageModalSelectiveRendering(id, looker);

  useEffect(() => {
    const unsub = looker.subscribeToState(
      "currentFrameNumber",
      (currentFrameNumber: number) => {
        if (!looker.thisFrameSample?.sample) {
          return;
        }

        const thisFrameId = `${id}-${currentFrameNumber}`;

        const newFieldsIfAny = getNewFields(thisFrameId);

        if (newFieldsIfAny) {
          looker.refreshSample(newFieldsIfAny, currentFrameNumber);
        } else {
          // repainting labels should be sufficient
          looker.refreshOverlaysToCurrentFrame();
        }
      }
    );

    return () => {
      unsub();
    };
  }, [getNewFields, looker]);
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
  }, [id, lookerOptions.activePaths, looker]);
};
