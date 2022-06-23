import React, {
  MutableRefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CallbackInterface, RecoilValue, useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";

import Flashlight, { FlashlightConfig } from "@fiftyone/flashlight";
import {
  freeVideos,
  FrameOptions,
  FrameConfig,
  VideoOptions,
  ImageOptions,
  VideoConfig,
  ImageConfig,
} from "@fiftyone/looker";

import useSetSampleView from "./useSetSampleView";
import createStore from "./createStore";
import useSelectSample, { SelectThumbnailData } from "./useSelectSample";

import { flashlightLooker } from "./FlashlightLooker.module.css";

let nextIndex = 0;

interface FlashlightLookerProps {
  lookerSettings: (
    | { config: FrameConfig; options: Partial<FrameOptions> }
    | { config: ImageConfig; options: Partial<ImageOptions> }
    | { config: VideoConfig; options: Partial<VideoOptions> }
  ) & { onClick?: (callbackInterface: CallbackInterface) => Promise<void> };

  flashlightSettings: {
    onResize: MutableRefObject<FlashlightConfig<number>["onResize"]>;
    rowAspectRatioThreshold: number;
    shouldRefresh: RecoilValue<boolean>;
  };
}

const deferrer =
  (initialized: MutableRefObject<boolean>) =>
  (fn: (...args: any[]) => void) =>
  (...args: any[]): void => {
    if (initialized.current) fn(...args);
  };

export const FlashlightLooker: React.FC<FlashlightLookerProps> = ({
  lookerSettings,
  flashlightSettings: { onResize, rowAspectRatioThreshold, shouldRefresh },
}) => {
  const [id] = useState(() => uuid());
  const [store] = useState(() => createStore());
  const setSample = useSetSampleView(store, lookerSettings.onClick);
  const initialized = useRef(false);
  const deferred = deferrer(initialized);
  const selectSample = useRef<(data: SelectThumbnailData) => void>();
  const refresh = useRecoilValue(shouldRefresh);

  const [flashlight] = useState(() => {
    const flashlight = new Flashlight<number>({
      initialRequestKey: 1,
      options: { rowAspectRatioThreshold },
      onItemClick: setSample,
      onResize: (...args) =>
        onResize.current ? onResize.current(...args) : {},
      onItemResize: (id, dimensions) =>
        store.lookers.has(id) && store.lookers.get(id)?.resize(dimensions),
      get: async (page) => {},
      render: (id, element, dimensions, soft, hide) => {
        const result = store.samples.get(id);

        if (store.lookers.has(id)) {
          const looker = store.lookers.get(id);
          hide ? looker?.disable() : looker?.attach(element, dimensions);

          return;
        }

        if (!soft) {
          const looker = createLooker.current(result);
          looker.addEventListener("selectthumbnail", selectSample.current);

          store.lookers.set(id, looker);
          looker.attach(element, dimensions);
        }
      },
    });

    return flashlight;
  });

  selectSample.current = useSelectSample(flashlight);

  useLayoutEffect(
    deferred(() => flashlight.updateOptions({ rowAspectRatioThreshold })),
    [rowAspectRatioThreshold]
  );

  useLayoutEffect(
    deferred(() =>
      flashlight.updateItems((sampleId) =>
        store.lookers.get(sampleId)?.updateOptions(lookerSettings.options)
      )
    ),
    [lookerSettings.options]
  );

  useLayoutEffect(() => flashlight.attach(id), []);
  useLayoutEffect(
    deferred(() => {
      if (!refresh) {
        return;
      }

      nextIndex = 0;
      flashlight.reset();
      store.reset();
      freeVideos();
    }),
    [refresh]
  );

  useEffect(() => {
    initialized.current = true;
  }, []);

  return <div id={id} className={flashlightLooker}></div>;
};
