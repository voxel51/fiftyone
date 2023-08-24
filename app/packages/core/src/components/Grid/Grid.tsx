import Flashlight from "@fiftyone/flashlight";
import { freeVideos } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import {
  stringifyObj,
  useDeferrer,
  useEventHandler,
  useExpandSample,
} from "@fiftyone/state";
import React, { useEffect, useLayoutEffect, useRef } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";
import useFlashlightPager from "../../useFlashlightPager";
import { flashlightLooker } from "./Grid.module.css";
import {
  gridCropCallback,
  pageParameters,
  rowAspectRatioThreshold,
} from "./recoil";
import useResize from "./useResize";

const Grid: React.FC<{}> = () => {
  const [id] = React.useState(() => uuid());
  const store = fos.useLookerStore();
  const expandSample = useExpandSample(store);
  const { init, deferred } = useDeferrer();

  const lookerOptions = fos.useLookerOptions(false);
  const createLooker = fos.useCreateLooker(false, true, lookerOptions);

  const selected = useRecoilValue(fos.selectedSamples);
  const threshold = useRecoilValue(rowAspectRatioThreshold);
  const resize = useResize();

  const isModalOpen = useRecoilValue(fos.isModalActive);
  const { page, reset } = useFlashlightPager(
    store,
    pageParameters,
    gridCropCallback
  );

  // create flashlight only one time
  const [flashlight] = React.useState(() => {
    const flashlight = new Flashlight<number>({
      containerId: "grid-flashlight",
      horizontal: false,
      showPixels: true,
      initialRequestKey: 0,
      options: { rowAspectRatioThreshold: threshold, offset: 52 },
      onItemClick: expandSample,
      onResize: resize.current,
      onItemResize: (id, dimensions) =>
        store.lookers.has(id) && store.lookers.get(id)?.resize(dimensions),
      get: page,
      render: (id, element, dimensions, soft, hide) => {
        let result = store.samples.get(id);

        if (store.lookers.has(id)) {
          const looker = store.lookers.get(id);
          hide ? looker?.disable() : looker?.attach(element, dimensions);

          return;
        }

        if (!createLooker.current || !result || !selectSample.current) {
          throw new Error("bad data");
        }

        const init = (l) => {
          l.addEventListener("selectthumbnail", ({ detail }: CustomEvent) => {
            selectSample.current(flashlight, detail);
          });

          l.addEventListener("reset", () => {
            l.detach();
            l.destroy();
            result = store.samples.get(id);
            if (!result) {
              throw new Error("unexpected value");
            }
            l = createLooker.current(result);
            init(l);
          });

          store.lookers.set(id, l);
          l.attach(element, dimensions);
        };

        if (!soft) {
          init(createLooker.current(result));
        }
      },
    });

    return flashlight;
  });

  useEffect(() => {
    deferred(() => {
      if (isModalOpen || isTagging || !flashlight.isAttached()) {
        return;
      }

      flashlight.reset();
      store.reset();
      freeVideos();
    });
  }, [
    deferred,
    reset,
    stringifyObj(useRecoilValue(fos.filters)),
    useRecoilValue(fos.datasetName),
    useRecoilValue(fos.cropToContent(false)),
    fos.filterView(useRecoilValue(fos.view)),
    useRecoilValue(fos.groupSlice(false)),
    useRecoilValue(fos.refresher),
    useRecoilValue(fos.similarityParameters),
    useRecoilValue(fos.selectedMediaField(false)),
    useRecoilValue(fos.extendedStagesUnsorted),
    useRecoilValue(fos.extendedStages),
  ]);

  const select = fos.useSelectFlashlightSample();
  const selectSample = useRef(select);
  selectSample.current = select;

  useLayoutEffect(
    () =>
      deferred(() =>
        flashlight.updateOptions({ rowAspectRatioThreshold: threshold })
      ),
    [deferred, flashlight, threshold]
  );

  useLayoutEffect(() => {
    deferred(() => {
      flashlight.updateItems((sampleId) => {
        store.lookers.get(sampleId)?.updateOptions({
          ...lookerOptions,
          selected: selected.has(sampleId),
        });
      });
    });
  }, [deferred, flashlight, lookerOptions, store, selected]);

  useLayoutEffect(() => {
    flashlight.attach(id);
    return () => flashlight.detach();
  }, [flashlight, id]);
  const taggingLabels = useRecoilValue(
    fos.tagging({ modal: false, labels: true })
  );

  const taggingSamples = useRecoilValue(
    fos.tagging({ modal: false, labels: false })
  );
  const isTagging = taggingLabels || taggingSamples;

  useEventHandler(
    document,
    "keydown",
    useRecoilCallback(
      ({ snapshot, reset }) =>
        async (event: KeyboardEvent) => {
          if (event.key !== "Escape") {
            return;
          }

          if (!(await snapshot.getPromise(fos.isModalActive))) {
            reset(fos.selectedSamples);
          }
        },
      []
    )
  );

  useEffect(() => {
    init();
  }, [init]);

  return <div id={id} className={flashlightLooker} data-cy="fo-grid"></div>;
};

export default Grid;
