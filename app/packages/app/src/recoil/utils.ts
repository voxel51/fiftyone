import { atom, selectorFamily, useRecoilCallback } from "recoil";

import * as atoms from "./atoms";
import * as selectors from "./selectors";

import socket from "../shared/connection";
import { labelFilters } from "../components/Filters/LabelFieldFilters.state";

export const messageListener = (type, handler) => {
  const wrapper = ({ data }) => {
    data = JSON.parse(data);
    data.type === type && handler(data);
  };
  socket.addEventListener("message", wrapper);

  return () => socket.removeEventListener("message", wrapper);
};

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
