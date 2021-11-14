import {
  RecoilState,
  selector,
  SetRecoilState,
  Snapshot,
  useRecoilCallback,
} from "recoil";

import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";

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
    const isFrame = get(viewAtoms.isFramesView);
    const isPatch = get(viewAtoms.isPatchesView);

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
  socket.send(packageMessage("update", { state }));
};

export const setModal = async (
  snapshot: Snapshot,
  set: <T>(
    recoilVal: RecoilState<T>,
    valOrUpdater: T | ((currVal: T) => T)
  ) => void
) => {
  const data = [
    [filterAtoms.modalFilters, filterAtoms.filters],
    [atoms.colorByLabel(true), atoms.colorByLabel(false)],
    [
      schemaAtoms.activeFields({ modal: true }),
      schemaAtoms.activeFields({ modal: false }),
    ],
    [atoms.cropToContent(true), atoms.cropToContent(false)],
    [atoms.colorSeed(true), atoms.colorSeed(false)],
    [atoms.sortFilterResults(true), atoms.sortFilterResults(false)],
    [atoms.alpha(true), atoms.alpha(false)],
  ];

  const results = Promise.all(
    data.map(([_, get]) => snapshot.getPromise(get as RecoilState<any>))
  );

  for (const i in results) {
    set(data[i][0], results[i]);
  }
};
