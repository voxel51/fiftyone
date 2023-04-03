import React, {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";

import Flashlight from "@fiftyone/flashlight";
import { freeVideos } from "@fiftyone/looker";

import { useEventHandler } from "@fiftyone/state";
import { flashlightLooker } from "./Grid.module.css";
import { rowAspectRatioThreshold } from "./recoil";
import useExpandSample from "./useExpandSample";
import usePage from "./usePage";
import useResize from "./useResize";

import * as fos from "@fiftyone/state";
import { deferrer, stringifyObj } from "@fiftyone/state";
import EmptySamples from "../EmptySamples";

const Grid: React.FC<{}> = () => {
  const [id] = React.useState(() => uuid());
  const store = fos.useLookerStore();
  const expandSample = useExpandSample(store);
  const initialized = useRef(false);
  const deferred = deferrer(initialized);

  const lookerOptions = fos.useLookerOptions(false);
  const createLooker = fos.useCreateLooker(false, true, lookerOptions);

  const selected = useRecoilValue(fos.selectedSamples);
  const [next, pager] = usePage(false, store);

  const threshold = useRecoilValue(rowAspectRatioThreshold);
  const resize = useResize();

  const isModalOpen = Boolean(useRecoilValue(fos.modal));

  // create flashlight only one time
  const [flashlight] = React.useState(() => {
    const flashlight = new Flashlight<number>({
      horizontal: false,
      initialRequestKey: 1,
      options: { rowAspectRatioThreshold: threshold, offset: 52 },
      onItemClick: expandSample,
      onResize: resize.current,
      onItemResize: (id, dimensions) =>
        store.lookers.has(id) && store.lookers.get(id)?.resize(dimensions),
      get: pager,
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

  useEffect(
    deferred(() => {
      if (isModalOpen || isTagging || !flashlight.isAttached()) {
        return;
      }

      next.current = 0;
      flashlight.reset();
      store.reset();
      freeVideos();
    }),
    [
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
    ]
  );

  const select = fos.useSelectFlashlightSample();
  const selectSample = useRef(select);
  selectSample.current = select;

  useLayoutEffect(
    deferred(() =>
      flashlight.updateOptions({ rowAspectRatioThreshold: threshold })
    ),
    [threshold]
  );

  useLayoutEffect(
    deferred(() => {
      flashlight.updateItems((sampleId) =>
        store.lookers.get(sampleId)?.updateOptions({
          ...lookerOptions,
          selected: selected.has(sampleId),
        })
      );
    }),
    [lookerOptions, selected]
  );

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
      ({ snapshot, set }) =>
        async (event: KeyboardEvent) => {
          if (event.key !== "Escape") {
            return;
          }

          if (!(await snapshot.getPromise(fos.modal))) {
            set(fos.selectedSamples, new Set());
          }
        },
      []
    )
  );

  useEffect(() => {
    initialized.current = true;
  }, []);

  return <div id={id} className={flashlightLooker} data-cy="fo-grid"></div>;
};

export default Grid;
