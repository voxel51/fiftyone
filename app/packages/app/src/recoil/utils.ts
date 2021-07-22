import { selector, useRecoilCallback } from "recoil";

import * as atoms from "./atoms";
import * as selectors from "./selectors";

import { labelFilters } from "../components/Filters/LabelFieldFilters.state";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { http } from "../shared/connection";

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
