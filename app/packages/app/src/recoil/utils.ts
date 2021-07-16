import { useRecoilCallback } from "recoil";

import * as atoms from "./atoms";
import * as selectors from "./selectors";

import { labelFilters } from "../components/Filters/LabelFieldFilters.state";

export const useSetModal = () => {
  return useRecoilCallback(
    ({ set }) => async (sampleId: string) => {
      set(atoms.modal, { visible: true, sampleId: sampleId });
      set(labelFilters(true), {});
    },
    []
  );
};

export const useClearModal = () => {
  return useRecoilCallback(
    ({ reset, set }) => async () => {
      reset(atoms.modal);
      set(selectors.selectedLabels, {});
      reset(atoms.hiddenLabels);
    },
    []
  );
};
