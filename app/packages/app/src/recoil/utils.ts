import { selector, useRecoilCallback } from "recoil";

import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";

import socket, { http } from "../shared/connection";
import { packageMessage } from "../utils/socket";

import * as atoms from "./atoms";
import * as selectors from "./selectors";
import { State } from "./types";
import * as viewAtoms from "./view";

type LookerTypes = typeof FrameLooker | typeof ImageLooker | typeof VideoLooker;

export const getSampleSrc = (filepath: string, id: string) => {
  return `${http}/filepath/${encodeURIComponent(filepath)}?id=${id}`;
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

export const setState = (state: State.Description) => {
  socket.send(packageMessage("update", { state }));
};
