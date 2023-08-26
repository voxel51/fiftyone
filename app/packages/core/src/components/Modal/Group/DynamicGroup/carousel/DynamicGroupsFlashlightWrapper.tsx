import Flashlight from "@fiftyone/flashlight";
import { Sample, freeVideos } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { selectedSamples } from "@fiftyone/state";
import { get } from "lodash";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  selector,
  useRecoilCallback,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import useFlashlightPager from "../../../../../useFlashlightPager";
import useSetDynamicGroupSample from "./useSetDynamicGroupSample";

export const DYNAMIC_GROUPS_FLASHLIGHT_CONTAINER_ID =
  "dynamic-groups-flashlight-container";
export const DYNAMIC_GROUPS_FLASHLIGHT_ELEMENT_ID =
  "dynamic-groups-flashlight-element";

const pageParams = selector({
  key: "paginateDynamicGroupVariables",
  get: ({ get }) => {
    const params = {
      dataset: get(fos.datasetName),
      view: get(fos.dynamicGroupViewQuery),
    };
    return (page: number, pageSize: number) => {
      return {
        ...params,
        filter: {},
        after: page ? String(page * pageSize - 1) : null,
        count: pageSize,
      };
    };
  },
});

export const DynamicGroupsFlashlightWrapper = () => {
  const id = useId();

  const store = fos.useLookerStore();
  const opts = fos.useLookerOptions(true);
  const modalSampleId = useRecoilValue(fos.modalSampleId);
  const field = useRecoilValue(fos.dynamicGroupParameters);
  const highlight = useCallback(
    (sample) => sample._id === modalSampleId,
    [modalSampleId]
  );

  const createLooker = fos.useCreateLooker(
    false,
    true,
    {
      ...opts,
      thumbnailTitle: (sample) =>
        field.orderBy ? get(sample, field.orderBy) : null,
    },
    highlight
  );

  const select = fos.useSelectSample();
  const selectSample = useRef(select);
  const flashlightRef = useRef<Flashlight<number>>();
  selectSample.current = select;

  const getScrollParams = useCallback(() => {
    const flashlight = flashlightRef.current;

    if (!flashlight) {
      return;
    }

    const containerWidth = flashlight.element.clientWidth;
    // elementWidth represents the width of the first element in the flashlight
    const elementWidth =
      flashlight.element.firstElementChild?.firstElementChild?.clientWidth ??
      100;

    const elementsCount = Math.ceil(containerWidth / elementWidth!);

    return { elementWidth, elementsCount, containerWidth };
  }, []);

  const setSample = useSetDynamicGroupSample();
  const { init, deferred } = fos.useDeferrer();
  const navigationCallback = useRecoilCallback(
    ({ snapshot }) =>
      async (isPrevious) => {
        const flashlight = flashlightRef.current;

        if (!flashlight) {
          return;
        }

        const id = await snapshot.getPromise(fos.modalSampleId);
        const currentSampleIndex = flashlight.itemIndexes[id];
        const nextSampleIndex = currentSampleIndex + (isPrevious ? -1 : 1);
        const nextSampleId = store.indices.get(nextSampleIndex);

        if (!nextSampleId) {
          return;
        }

        setSample(id);

        // todo: implement better scrolling logic
        if (flashlightRef.current) {
          const { elementWidth } = getScrollParams()!;

          const newLeft = isPrevious
            ? flashlightRef.current?.element.scrollLeft - elementWidth
            : flashlightRef.current?.element.scrollLeft + elementWidth;

          flashlightRef.current?.element.scroll({
            left: newLeft,
            behavior: "smooth",
          });
        }
      },
    [store, store, setSample]
  );

  const { page, reset } = useFlashlightPager(store, pageParams);

  const [flashlight] = useState(() => {
    const flashlight = new Flashlight({
      horizontal: true,
      containerId: DYNAMIC_GROUPS_FLASHLIGHT_CONTAINER_ID,
      elementId: DYNAMIC_GROUPS_FLASHLIGHT_ELEMENT_ID,
      enableHorizontalKeyNavigation: {
        navigationCallback,
        previousKey: "<",
        nextKey: ">",
      },
      initialRequestKey: 0,
      onItemClick: (_, id) => setSample(id),
      options: {
        rowAspectRatioThreshold: 0,
      },
      get: page,
      render: (sampleId, element, dimensions, soft, hide) => {
        const result = store.samples.get(sampleId);

        const looker = store.lookers.get(sampleId);
        if (looker) {
          hide ? looker.disable() : looker.attach(element, dimensions);
          return;
        }

        if (!soft && createLooker.current && result) {
          const looker = createLooker.current(result);
          looker.addEventListener(
            "selectthumbnail",
            ({ detail }: CustomEvent) => {
              selectSample.current(detail.sampleId);
            }
          );

          store.lookers.set(sampleId, looker);

          looker.attach(element, dimensions);
        }
      },
    });

    return flashlight;
  });

  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  useLayoutEffect(() => {
    deferred(() => {
      if (!flashlight.isAttached()) {
        return;
      }

      flashlight.reset();

      freeVideos();
    });
  }, [deferred, reset, flashlight, mediaField]);

  useLayoutEffect(() => {
    flashlight.attach(id);
    flashlightRef.current = flashlight;

    return () => flashlight.detach();
  }, [flashlight, id]);

  const selected = useRecoilValue(selectedSamples);

  const updateItem = useCallback(
    async (id: string) => {
      store.lookers.get(id)?.updateOptions({
        ...opts,
        selected: selected.has(id),
        highlight: highlight(store.samples.get(id)!.sample as Sample),
      });
    },
    [highlight, opts, selected, store]
  );

  const options = useRecoilValueLoadable(
    fos.lookerOptions({ modal: true, withFilter: true })
  );
  useLayoutEffect(() => {
    deferred(() => {
      flashlight.updateItems(updateItem);
    });
  }, [deferred, flashlight, updateItem, options, selected]);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        position: "relative",
      }}
      id={id}
    ></div>
  );
};
