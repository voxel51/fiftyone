import { useTheme } from "@fiftyone/components";
import Flashlight, { Response } from "@fiftyone/flashlight";
import { Sample, freeVideos, zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import {
  groupPaginationFragment,
  selectedSamples,
  useBrowserStorage,
} from "@fiftyone/state";
import { get } from "lodash";
import { Resizable } from "re-resizable";
import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useErrorHandler } from "react-error-boundary";
import { usePaginationFragment } from "react-relay";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { v4 as uuid } from "uuid";
import useSetGroupSample from "./useSetGroupSample";

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

const Column: React.FC = () => {
  const [id] = useState(() => uuid());
  const pageCount = useRef(0);

  const { data, hasNext, loadNext } = usePaginationFragment(
    foq.paginateGroupPaginationFragment,
    useRecoilValue(groupPaginationFragment)
  );

  const samples = {
    ...data.samples,
    edges: data.samples.edges.filter(
      (s) => s.node.sample._media_type !== "point-cloud"
    ),
  };

  const store = fos.useLookerStore();
  const opts = fos.useLookerOptions(true);
  const groupField = useRecoilValue(fos.groupField);
  const currentSlice = useRecoilValue(fos.groupSlice(true));
  const highlight = useCallback(
    (sample: Sample) => {
      return get(sample, groupField).name === currentSlice;
    },
    [currentSlice, groupField]
  );
  const createLooker = fos.useCreateLooker(
    true,
    true,
    {
      ...opts,
      thumbnailTitle: (sample) => {
        return sample[groupField]?.name;
      },
    },
    highlight
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

  const select = fos.useSelectSample();
  const selectSample = useRef(select);
  selectSample.current = select;
  const setGroupSample = useSetGroupSample(store);

  const [flashlight] = useState(() => {
    const flashlight = new Flashlight({
      horizontal: true,
      initialRequestKey: 0,
      onItemClick: setGroupSample,
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

  useLayoutEffect(() => {
    flashlight.updateItems(updateItem);
  }, [
    flashlight,
    updateItem,
    useRecoilValueLoadable(
      fos.lookerOptions({ modal: true, withFilter: true })
    ),
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

export const GroupCarousel: React.FC<{ fullHeight?: boolean }> = ({
  fullHeight,
}) => {
  const [height, setHeight] = useBrowserStorage(
    "carousel-height",
    fullHeight ? 500 : 150
  );

  const theme = useTheme();

  return (
    <Resizable
      size={{ height, width: "100%" }}
      minHeight={200}
      maxHeight={fullHeight ? 500 : 300}
      enable={{
        top: fullHeight ? true : false,
        right: false,
        bottom: true,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      style={{
        zIndex: 1000,
        borderBottom: `1px solid ${theme.primary.plainBorder}`,
      }}
      onResizeStop={(e, direction, ref, { height: delta }) => {
        setHeight(Math.max(height + delta, 100));
      }}
    >
      <Column />
    </Resizable>
  );
};
