import { getFetchFunction, getFetchHost } from "@fiftyone/utilities";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import {
  selector,
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
} from "recoil";

import * as atoms from "./atoms";
import * as selectors from "./selectors";
import { State } from "./types";
import * as viewAtoms from "./view";
import { useUnprocessedStateUpdate } from "../utils/hooks";

type LookerTypes = typeof FrameLooker | typeof ImageLooker | typeof VideoLooker;

export const getSampleSrc = (filepath: string, id: string, url?: string) => {
  if (url) {
    return url;
  }

  return `${getFetchHost()}/media?filepath=${encodeURIComponent(
    filepath
  )}&id=${id}`;
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
  return useRecoilTransaction_UNSTABLE(
    ({ set, get }) => () => {
      const fullscreen = get(atoms.fullscreen);
      if (fullscreen) {
        return;
      }
      const currentOptions = get(atoms.savedLookerOptions);
      set(atoms.savedLookerOptions, { ...currentOptions, showJSON: false });
      set(atoms.modal, null);
      set(atoms.selectedLabels, {});
      set(atoms.hiddenLabels, {});
    },
    []
  );
};

export const useSetState = () => {
  const updateState = useUnprocessedStateUpdate();
  return useRecoilTransaction_UNSTABLE(
    ({ get }) => (state: Partial<State.Description>) =>
      getFetchFunction()("POST", "/update", {
        state: { ...get(atoms.stateDescription), ...state },
      }).then((data) => updateState(data))
  );
};
