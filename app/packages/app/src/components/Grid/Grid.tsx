import React, {
  MutableRefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";

import Flashlight from "@fiftyone/flashlight";
import { freeVideos } from "@fiftyone/looker";

import { flashlightLooker } from "./Grid.module.css";
import {
  cropToContent,
  refresher,
  selectedSamples,
  tagging,
} from "../../recoil/atoms";
import useCreateLooker from "../../hooks/useCreateLooker";
import useLookerStore from "../../hooks/useLookerStore";
import { rowAspectRatioThreshold } from "./recoil";
import { useLookerOptions } from "../../recoil/looker";
import useResize from "./useResize";
import usePage from "./usePage";
import useExpandSample from "./useExpandSample";
import useSelectSample, {
  SelectThumbnailData,
} from "../../hooks/useSelectSample";
import * as viewAtoms from "../../recoil/view";
import { filterView } from "../../utils/view";
import { filters } from "../../recoil/filters";
import { datasetName } from "../../recoil/selectors";
import { deferrer, stringifyObj } from "@fiftyone/components";

const Grid: React.FC<{}> = () => {
  const [id] = useState(() => uuid());
  const store = useLookerStore();
  const expandSample = useExpandSample(store);
  const initialized = useRef(false);
  const deferred = deferrer(initialized);
  const lookerOptions = useLookerOptions(false);
  const createLooker = useCreateLooker(true, lookerOptions);
  const selected = useRecoilValue(selectedSamples);
  const [next, pager] = usePage(false, store);
  const threshold = useRecoilValue(rowAspectRatioThreshold);
  const resize = useResize();

  const [flashlight] = useState(() => {
    const flashlight = new Flashlight<number>({
      horizontal: false,
      initialRequestKey: 1,
      options: { rowAspectRatioThreshold: threshold, offset: 60 },
      onItemClick: expandSample,
      onResize: resize.current,
      onItemResize: (id, dimensions) =>
        store.lookers.has(id) && store.lookers.get(id)?.resize(dimensions),
      get: pager,
      render: (id, element, dimensions, soft, hide) => {
        const result = store.samples.get(id);

        if (store.lookers.has(id)) {
          const looker = store.lookers.get(id);
          hide ? looker?.disable() : looker?.attach(element, dimensions);

          return;
        }

        if (!createLooker.current || !result || !selectSample.current) {
          throw new Error("bad data");
        }

        if (!soft) {
          const looker = createLooker.current(result);
          looker.addEventListener(
            "selectthumbnail",
            ({ detail }: CustomEvent) => {
              selectSample.current(detail);
            }
          );

          store.lookers.set(id, looker);
          looker.attach(element, dimensions);
        }
      },
    });

    return flashlight;
  });

  const selectSample = useRef<(data: SelectThumbnailData) => void>(
    useSelectSample(flashlight)
  );
  selectSample.current = useSelectSample(flashlight);

  useLayoutEffect(
    deferred(() =>
      flashlight.updateOptions({ rowAspectRatioThreshold: threshold })
    ),
    [threshold]
  );

  useLayoutEffect(
    deferred(() =>
      flashlight.updateItems((sampleId) =>
        store.lookers.get(sampleId)?.updateOptions({
          ...lookerOptions,
          selected: selected.has(sampleId),
        })
      )
    ),
    [lookerOptions, selected]
  );

  useLayoutEffect(() => {
    flashlight.attach(id);
    return () => flashlight.detach();
  }, [flashlight, id]);
  const taggingLabels = useRecoilValue(tagging({ modal: false, labels: true }));

  const taggingSamples = useRecoilValue(
    tagging({ modal: false, labels: false })
  );
  const isTagging = taggingLabels || taggingSamples;
  const dd = useRecoilValue(datasetName);

  useLayoutEffect(
    deferred(() => {
      if (isTagging || !flashlight.isAttached()) {
        return;
      }
      console.log(dd);

      next.current = 0;
      flashlight.reset();
      store.reset();
      freeVideos();
    }),
    [dd]
  );

  useEffect(() => {
    initialized.current = true;
  }, []);

  return <div id={id} className={flashlightLooker}></div>;
};

export default Grid;
