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
  const lookerOptions = useLookerOptions(true);

  const getNewFields = useDetectNewActiveLabelFields({
    modal: true,
  });

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
        } else {
          looker.updateSample(looker.thisFrameSample.sample);
        }
      }
    );

    return () => {
      unsub();
    };
  }, [getNewFields, looker]);
};
