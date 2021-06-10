import { atom, useRecoilCallback } from "recoil";
import { v4 as uuid } from "uuid";

import * as atoms from "./atoms";
import * as selectors from "./selectors";

import socket from "../shared/connection";
import { labelFilters } from "../components/Filters/LabelFieldFilters.state";
import { request } from "../utils/socket";

export const showModalJSON = atom({
  key: "showModalJSON",
  default: false,
});

export const useSetModal = () => {
  return useRecoilCallback(
    ({ set, snapshot }) => async (sampleId: string) => {
      set(atoms.modal, { visible: true, sampleId: sampleId });
      const filters = await snapshot.getPromise(labelFilters(false));
      set(labelFilters(true), filters);
    },
    []
  );
};

export const useClearModal = () => {
  return useRecoilCallback(
    ({ reset }) => async () => {
      reset(atoms.modal);
      reset(selectors.selectedLabels);
      reset(atoms.hiddenLabels);
      reset(showModalJSON);
    },
    []
  );
};

export const useLoadFrames = () => {
  return useRecoilCallback(({ set }) => async (sampleId: string) => {
    const data = await request({
      type: "sample",
      args: { sample_id: sampleId },
      uuid: uuid(),
    });
  });
};
