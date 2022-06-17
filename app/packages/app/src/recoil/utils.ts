import { getFetchOrigin } from "@fiftyone/utilities";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { selector, useRecoilTransaction_UNSTABLE } from "recoil";

import * as atoms from "./atoms";
import * as viewAtoms from "./view";
import { useUnprocessedStateUpdate } from "../utils/hooks";

type LookerTypes = typeof FrameLooker | typeof ImageLooker | typeof VideoLooker;

export const getSampleSrc = (filepath: string, id: string, url?: string) => {
  if (url) {
    return url;
  }

  return `${getFetchOrigin()}/media?filepath=${encodeURIComponent(
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
