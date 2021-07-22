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
    ({ reset, set, snapshot }) => async () => {
      const currentOptions = await snapshot.getPromise(
        atoms.savedLookerOptions
      );
      reset(atoms.modal);
      set(atoms.savedLookerOptions, { ...currentOptions, showJSON: false });
      set(selectors.selectedLabels, {});
      reset(atoms.hiddenLabels);
    },
    []
  );
};
