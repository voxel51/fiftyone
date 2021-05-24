import { atom, useRecoilCallback } from "recoil";

import * as atoms from "./atoms";
import * as selectors from "./selectors";
import * as labelAtoms from "./../components/Filters/LabelFieldFilters.state";

import socket from "../shared/connection";
import { request } from "../utils/socket";

export const messageListener = (type, handler) => {
  const wrapper = ({ data }) => {
    data = JSON.parse(data);
    data.type === type && handler(data);
  };
  socket.addEventListener("message", wrapper);

  return () => socket.removeEventListener("message", wrapper);
};

const loadedModalSamples = atom({
  key: "loadedModalSamples",
  default: new Set<string>(),
});

export const useLoadModal = () => {
  const loadSample = useLoadModalSample();
  return useRecoilCallback(({ set }) => async (sampleId: string) => {
    set(atoms.modal, { visible: true, sample_id: sampleId });
  });
};

export const useClearModal = () => {
  return useRecoilCallback(
    ({ snapshot, reset }) => async () => {
      const loaded = await snapshot.getPromise(loadedModalSamples);
      loaded.forEach((id) => reset(atoms.sampleModal(id)));
      reset(atoms.modal);
      reset(selectors.selectedLabels);
      reset(atoms.hiddenLabels);
      reset(labelAtoms.labelFilters(true));
      reset(atoms.showModalJSON);
      document.body.classList.toggle("noscroll", false);
    },
    []
  );
};
