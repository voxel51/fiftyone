import { ImaVidFramesController } from "@fiftyone/looker/src/lookers/imavid/controller";
import LRUCache from "lru-cache";
import { useCallback, useState } from "react";
import { useRecoilValue } from "recoil";
import { shouldRenderImaVidLooker } from "../recoil";

type FrameId = string;

type Frame = {
  id: FrameId;
  // might not need dispose at all
  dispose: () => {};
};

const createFramesCache = () => {
  return new LRUCache<FrameId, Frame>({
    max: 500,
    dispose: (id, frame) => frame.dispose(),
  });
};

export interface ImaVidStore {
  indices: Map<number, string>;
  frames: LRUCache<string, Frame>;
  reset: () => void;
}

const createImaVidStore = (): ImaVidStore => {
  const indices = new Map<number, string>();
  const frames = createFramesCache();

  return {
    indices,
    frames,
    reset: () => {
      indices.clear();
      frames.reset();
    },
  };
};

const useImaVid = () => {
  const shouldRenderImaVidLooker_ = useRecoilValue(shouldRenderImaVidLooker);
  const [store] = useState(() => createImaVidStore());

  const fetchMore = useCallback(() => {
    
  }, [])

  const getImaVidController = useCallback(
    (sample: any) => {
      debugger; // check value of sample to type it

      if (!shouldRenderImaVidLooker_) {
        return null;
      }

      const controller = new ImaVidFramesController(store, fetchMore);
      return controller;
    },
    [shouldRenderImaVidLooker_, store]
  );

  return getImaVidController;
};

export default useImaVid;
