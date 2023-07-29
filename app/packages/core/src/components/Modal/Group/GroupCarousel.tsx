import { Loading, useTheme } from "@fiftyone/components";
import Flashlight from "@fiftyone/flashlight";
import { Sample, freeVideos } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { selectedSamples, useBrowserStorage } from "@fiftyone/state";
import { get } from "lodash";
import { Resizable } from "re-resizable";
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { selector, useRecoilValue, useRecoilValueLoadable } from "recoil";
import { v4 as uuid } from "uuid";
import useFlashlightPager from "../../../useFlashlightPager";
import useSetGroupSample from "./useSetGroupSample";

const groupCarouselSlices = selector<string[]>({
  key: "groupCarouselSlices",
  get: ({ get }) => {
    const mediaTypesSet = get(fos.groupMediaTypesSet);
    const slices = get(fos.groupSlices);

    if (mediaTypesSet.size === 1 && mediaTypesSet.has("point-cloud")) {
      return slices;
    }

    const mediaTypes = Object.fromEntries(
      get(fos.groupMediaTypes).map(({ name, mediaType }) => [name, mediaType])
    );

    return slices.filter((slice) => mediaTypes[slice] !== "point_cloud");
  },
});

const pageParams = selector({
  key: "paginateGroupVariables",
  get: ({ getCallback }) => {
    return getCallback(
      ({ snapshot }) =>
        async (page: number, pageSize: number) => {
          return {
            dataset: await snapshot.getPromise(fos.datasetName),
            view: await snapshot.getPromise(fos.view),
            filter: {
              group: {
                slice: await snapshot.getPromise(fos.groupSlice(false)),
                id: await snapshot.getPromise(fos.groupId),
                slices: await snapshot.getPromise(groupCarouselSlices),
              },
            },
            after: page ? String(page * pageSize) : null,
            first: pageSize,
          };
        }
    );
  },
});

const Column: React.FC = () => {
  const [id] = useState(() => uuid());
  const store = fos.useLookerStore();
  const opts = fos.useLookerOptions(true);

  const groupField = useRecoilValue(fos.groupField);
  const currentSlice = useRecoilValue(fos.groupSlice(true));

  const highlight = useCallback(
    (sample) => get(sample, groupField).name === currentSlice,
    [currentSlice, groupField]
  );

  const createLooker = fos.useCreateLooker(
    false,
    true,
    {
      ...opts,
      thumbnailTitle: (sample) => get(sample, groupField).name,
    },
    highlight
  );

  const select = fos.useSelectSample();
  const selectSample = useRef(select);
  selectSample.current = select;
  const setGroupSample = useSetGroupSample(store);
  const [empty, pager] = useFlashlightPager(store, pageParams);

  const [flashlight] = useState(() => {
    const flashlight = new Flashlight({
      horizontal: true,
      initialRequestKey: 0,
      onItemClick: setGroupSample,
      options: {
        rowAspectRatioThreshold: 0,
      },
      get: pager,
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
    if (!flashlight.isAttached()) {
      return;
    }

    flashlight.reset();

    freeVideos();
  }, [flashlight, mediaField]);

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

  const options = useRecoilValueLoadable(
    fos.lookerOptions({ modal: true, withFilter: true })
  );
  useLayoutEffect(() => {
    flashlight.updateItems(updateItem);
  }, [flashlight, updateItem, options, selected]);

  if (empty) {
    return <Loading>No data</Loading>;
  }

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
      data-cy={"group-carousel"}
    >
      <Column />
    </Resizable>
  );
};
