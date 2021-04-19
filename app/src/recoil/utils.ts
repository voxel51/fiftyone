import { atom, useRecoilCallback } from "recoil";

import * as atoms from "./atoms";

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

export const useLoadModalSample = () => {
  return useRecoilCallback(
    ({ set }) => async (sampleId: string) => {
      const { sample } = await request("get_sample", { sample_id, sampleId });
      set(atoms.sampleModal(sampleId), sample);
    },
    []
  );
};

export const useClearModalSamples = () => {
  return useRecoilCallback(
    ({ snapshot, reset }) => async () => {
      const loaded = await snapshot.getPromise(loadedModalSamples);
      loaded.forEach((id) => reset(atoms.sampleModal(id)));
    },
    []
  );
};
