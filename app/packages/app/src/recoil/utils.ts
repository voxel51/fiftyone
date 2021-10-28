import {
  GetRecoilValue,
  selector,
  SetRecoilState,
  useRecoilCallback,
} from "recoil";

import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { toSnakeCase } from "@fiftyone/utilities";

import socket, { http } from "../shared/connection";
import { packageMessage } from "../utils/socket";

import * as atoms from "./atoms";
import * as filterAtoms from "./filters";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import { State } from "./types";
import * as viewAtoms from "./view";

type LookerTypes = typeof FrameLooker | typeof ImageLooker | typeof VideoLooker;

export const getSampleSrc = (filepath: string, id: string) => {
  return `${http}/filepath/${encodeURI(filepath)}?id=${id}`;
};

export const lookerType = selector<(mimetype: string) => LookerTypes>({
  key: "lookerType",
  get: ({ get }) => {
    const isFrame = get(selectors.isFramesView);
    const isPatch = get(selectors.isPatchesView);

    return (mimetype) => {
      const video = mimetype.startsWith("video/");
      if (video && (isFrame || isPatch)) {
        return FrameLooker;
      }

      if (video) {
        return VideoLooker;
      }
      return ImageLooker;
    };
  },
});

export const useClearModal = () => {
  return useRecoilCallback(
    ({ set, snapshot }) => async () => {
      const fullscreen = await snapshot.getPromise(atoms.fullscreen);
      if (fullscreen) {
        return;
      }
      const currentOptions = await snapshot.getPromise(
        atoms.savedLookerOptions
      );
      set(atoms.savedLookerOptions, { ...currentOptions, showJSON: false });
      set(atoms.modal, null);
      set(selectors.selectedLabels, {});
      set(atoms.hiddenLabels, {});
    },
    []
  );
};

export const setState = (set: SetRecoilState, state: State.Description) => {
  set(atoms.stateDescription, state);
  socket.send(packageMessage("update", { state: toSnakeCase(state) }));
};

export const modalState = selector<null>({
  key: "modalState",
  get: () => null,
  set: ({ get, set }) => setModal(get, set),
});

const setModal = (get: GetRecoilValue, set: SetRecoilState) => {
  set(filterAtoms.modalFilters, get(filterAtoms.filters));
  set(atoms.colorByLabel(true), get(atoms.colorByLabel(false)));
  set(schemaAtoms.activeFields(true), get(schemaAtoms.activeFields(true)));
  set(atoms.cropToContent(true), get(atoms.cropToContent(false)));
  set(atoms.colorSeed(true), get(atoms.colorSeed(false)));
  set(atoms.sortFilterResults(true), get(atoms.sortFilterResults(false)));
  set(atoms.alpha(true), get(atoms.alpha(false)));
};
