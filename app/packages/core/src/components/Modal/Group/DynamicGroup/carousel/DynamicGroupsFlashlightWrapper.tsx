import Flashlight, { Response } from "@fiftyone/flashlight";
import { freeVideos, zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useErrorHandler } from "react-error-boundary";
import { usePaginationFragment } from "react-relay";
import {
  useRecoilCallback,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { useGroupContext } from "../../GroupContextProvider";

export const DYNAMIC_GROUPS_FLASHLIGHT_CONTAINER_ID =
  "dynamic-groups-flashlight-container";
export const DYNAMIC_GROUPS_FLASHLIGHT_ELEMENT_ID =
  "dynamic-groups-flashlight-element";

const process = (
  next: MutableRefObject<number>,
  store: fos.LookerStore<any>,
  zoom: boolean,
  edges: foq.paginateGroup_query$data["samples"]["edges"]
) =>
  edges.reduce((acc, { node }) => {
    if (
      node.__typename === "ImageSample" ||
      node.__typename === "VideoSample"
    ) {
      let data: any = {
        sample: node.sample,
        aspectRatio: node.aspectRatio,
        urls: Object.fromEntries(
          node.urls.map(({ field, url }) => [field, url])
        ),
      };

      if (node.__typename === "VideoSample") {
        data = {
          ...data,
          frameRate: node.frameRate,
          frameNumber: node.sample.frame_number,
        };
      }

      store.samples.set(node.sample._id, data);
      store.indices.set(next.current, node.sample._id);
      next.current++;

      return [
        ...acc,
        {
          aspectRatio: zoom
            ? zoomAspectRatio(node.sample as any, node.aspectRatio)
            : node.aspectRatio,
          id: (node.sample as any)._id as string,
        },
      ];
    }

    return acc;
  }, []);

export const DynamicGroupsFlashlightWrapper: React.FC<{
  setIsGroupEmpty: (isGroupEmpty: boolean) => void;
}> = ({ setIsGroupEmpty }) => {
  const id = useId();
  const pageCount = useRef(0);

  const { groupByFieldValue } = useGroupContext();

  const { data, hasNext, loadNext } = usePaginationFragment(
    foq.paginateGroupPaginationFragment,
    useRecoilValue(
      fos.dynamicGroupPaginationFragment({
        fieldOrExpression: groupByFieldValue!,
      })
    )
  );

  // todo: support pcd
  const samples = useMemo(
    () => ({
      ...data.samples,
      edges: data.samples.edges.filter(
        (s) => s.node.sample._media_type !== "point-cloud"
      ),
    }),
    [data]
  );

  useEffect(() => {
    setIsGroupEmpty(samples.edges.length === 0);
  }, [samples, setIsGroupEmpty]);

  const store = fos.useLookerStore();
  const opts = fos.useLookerOptions(true);
  const createLooker = fos.useCreateLooker(
    true,
    true,
    {
      ...opts,
    },
    true
  );

  const hasNextRef = useRef(true);
  hasNextRef.current = hasNext;
  const countRef = useRef(0);
  const handleError = useErrorHandler();

  const resolveRef = useRef<((value: Response<number>) => void) | null>(null);
  const nextRef = useRef(loadNext);
  nextRef.current = loadNext;

  useEffect(() => {
    if (resolveRef.current && countRef.current !== samples.edges.length) {
      pageCount.current += 1;
      resolveRef.current({
        items: process(
          countRef,
          store,
          false,
          samples.edges.slice(countRef.current)
        ),
        nextRequestKey: pageCount.current,
      });
      countRef.current = samples.edges.length;
      resolveRef.current = null;
    }
  }, [samples]);

  const setSample = fos.useSetExpandedSample();

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

  const navigationCallback = useRecoilCallback(
    ({ snapshot }) =>
      async (isPrevious) => {
        const flashlight = flashlightRef.current;

        if (!flashlight) {
          return;
        }

        const modalSampleId = await snapshot.getPromise(fos.modalSampleId);

        if (!modalSampleId) {
          return;
        }

        const currentSampleIndex = flashlight.itemIndexes[modalSampleId];
        const nextSampleIndex = currentSampleIndex + (isPrevious ? -1 : 1);
        const nextSampleId = store.indices.get(nextSampleIndex);

        if (!nextSampleId) {
          return;
        }

        const nextSample = store.samples.get(nextSampleId);
        nextSample && setSample(nextSample);

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
    [setSample, store.indices, store.samples]
  );

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
      onItemClick: (next, id, items) => {
        const sample = store.samples.get(id);
        sample && setSample(sample);
      },
      options: {
        rowAspectRatioThreshold: 0,
      },
      get: (page) => {
        pageCount.current = page + 1;
        if (pageCount.current === 1) {
          return Promise.resolve({
            items: process(countRef, store, false, samples.edges),
            nextRequestKey: hasNext ? pageCount.current : null,
          });
        } else {
          hasNextRef.current &&
            nextRef.current(20, {
              onComplete: (error) => error && handleError(error),
            });
          return new Promise((resolve) => {
            resolveRef.current = resolve;
          });
        }
      },
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

  useLayoutEffect(() => {
    if (!flashlight.isAttached()) {
      return;
    }

    flashlight.reset();

    freeVideos();
  }, [useRecoilValue(fos.selectedMediaField(true))]);

  useLayoutEffect(() => {
    flashlight.attach(id);
    flashlightRef.current = flashlight;

    return () => flashlight.detach();
  }, [flashlight, id]);

  const updateItem = useRecoilCallback(
    ({ snapshot }) =>
      async (id: string) => {
        store.lookers.get(id)?.updateOptions({
          ...opts,
          selected: snapshot.getLoadable(fos.selectedSamples).contents.has(id),
          highlight: (await snapshot.getPromise(fos.modalSampleId)) === id,
        });
      },
    [opts]
  );

  useLayoutEffect(() => {
    flashlight.updateItems(updateItem);
  }, [
    flashlight,
    updateItem,
    useRecoilValueLoadable(
      fos.lookerOptions({ modal: true, withFilter: true })
    ),
    useRecoilValue(fos.currentModalSample),
    useRecoilValue(fos.selectedSamples),
  ]);

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
