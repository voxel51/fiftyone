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
