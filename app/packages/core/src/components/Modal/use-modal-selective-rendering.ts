import { ImaVidLooker } from "@fiftyone/looker";
import { Lookers, useLookerOptions } from "@fiftyone/state";
import { useEffect } from "react";
import { useDetectNewActiveLabelFields } from "../Sidebar/useDetectNewActiveLabelFields";

export const useModalSelectiveRendering = (id: string, looker: Lookers) => {
  const lookerOptions = useLookerOptions(true);

  const getNewFields = useDetectNewActiveLabelFields({
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
  const getNewFields = useDetectNewActiveLabelFields({
    modal: true,
  });

  // this is for default view
  // subscription below will not have triggered for the first frame
  useModalSelectiveRendering(id, looker);

  useEffect(() => {
    const unsub = looker.subscribeToState(
      "currentFrameNumber",
      (currentFrameNumber: number) => {
        if (!looker.thisFrameSample?.sample) {
          return;
        }

        const newFieldsIfAny = getNewFields(`${id}-${currentFrameNumber}`);

        if (newFieldsIfAny) {
          looker.refreshSample(newFieldsIfAny, currentFrameNumber);
        }
      }
    );

    return () => {
      unsub();
    };
  }, [getNewFields, looker]);
};
