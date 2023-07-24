import { useTheme } from "@fiftyone/components";
import Flashlight from "@fiftyone/flashlight";
import { Sample, freeVideos } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { selectedSamples, useBrowserStorage } from "@fiftyone/state";
import { get } from "lodash";
import { Resizable } from "re-resizable";
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { fetchQuery, useRelayEnvironment } from "react-relay";
import { selector, useRecoilValue, useRecoilValueLoadable } from "recoil";
import { v4 as uuid } from "uuid";
import useSetGroupSample from "./useSetGroupSample";

const process = (
  offset: number,
  store: fos.LookerStore<fos.Lookers>,
  data: foq.paginateGroupQuery$data,
  shouldFilterPointClouds: boolean
) => {
  let edges = data.samples.edges;
  if (shouldFilterPointClouds) {
    edges = edges.filter(({ node }) => node.__typename !== "PointCloudSample");
  }
  return edges.map((edge, i) => {
    if (edge.node.__typename === "%other") {
      throw new Error("unexpected sample type");
    }

    store.samples.set(edge.node.id, edge.node as fos.ModalSample);
    store.indices.set(offset + i, edge.node.id);

    return {
      aspectRatio: edge.node.aspectRatio,
      id: edge.node.id,
    };
  });
};

const shouldFilterPointClouds = selector<boolean>({
  key: "shouldFilterPointClouds",
  get: ({ get }) => !get(fos.pcdOnly) && get(fos.pointCloudSliceExists),
});

const pageParams = selector({
  key: "paginateGroupVariables",
  get: ({ getCallback }) => {
    return getCallback(({ snapshot }) => async (page: number) => {
      return {
        filterPointClouds: await snapshot.getPromise(shouldFilterPointClouds),
        variables: {
          dataset: await snapshot.getPromise(fos.datasetName),
          view: await snapshot.getPromise(fos.view),
          filter: {
            group: {
              id: await snapshot.getPromise(fos.groupId),
            },
          },
          after: page % 20,
          first: 20,
        },
      };
    });
  },
});

const Column: React.FC = () => {
  const [id] = useState(() => uuid());
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

  const page = useRecoilValue(pageParams);
  const select = fos.useSelectSample();
  const selectSample = useRef(select);
  selectSample.current = select;
  const setGroupSample = useSetGroupSample(store);
  const environment = useRelayEnvironment();

  const [flashlight] = useState(() => {
    const flashlight = new Flashlight({
      horizontal: true,
      initialRequestKey: 0,
      onItemClick: setGroupSample,
      options: {
        rowAspectRatioThreshold: 0,
      },
      get: async (pageNumber) => {
        const { variables, filterPointClouds } = await page(pageNumber);
        return new Promise((resolve) => {
          const subscription = fetchQuery<foq.paginateGroupQuery>(
            environment,
            foq.paginateGroup,
            variables,
            { fetchPolicy: "network-only" }
          ).subscribe({
            next: (data) => {
              const items = process(
                variables.after,
                store,
                data,
                filterPointClouds
              );
              subscription.unsubscribe();
              resolve({
                items,
                nextRequestKey: data.samples.pageInfo.hasNextPage
                  ? pageNumber + 1
                  : null,
              });
            },
          });
        });
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
      data-cy={"group-carousel"}
    >
      <Column />
    </Resizable>
  );
};
