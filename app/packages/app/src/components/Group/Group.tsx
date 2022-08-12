import { Loading, useTheme } from "@fiftyone/components";
import Flashlight, { Response } from "@fiftyone/flashlight";
import { Resizable } from "re-resizable";
import React, {
  MutableRefObject,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  PreloadedQuery,
  usePaginationFragment,
  usePreloadedQuery,
} from "react-relay";
import {
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { useErrorHandler } from "react-error-boundary";
import { v4 as uuid } from "uuid";

import { zoomAspectRatio } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import * as foq from "@fiftyone/relay";
import { groupPaginationFragment, groupQuery } from "@fiftyone/state";

const process = (
  next: MutableRefObject<number>,
  store: fos.LookerStore<any>,
  zoom: boolean,
  edges: foq.paginateGroup_query$data["samples"]["edges"]
) =>
  edges.map(({ node }) => {
    if (node.__typename === "%other") {
      throw new Error("invalid response");
    }
    const data = {
      sample: node.sample,
      dimensions: [node.width, node.height],
      frameRate: node.frameRate,
      frameNumber: node.sample.frame_number,
    };

    store.samples.set(node.sample._id, data);
    store.indices.set(next.current, node.sample._id);
    next.current++;

    const aspectRatio = node.width / node.height;

    return {
      aspectRatio: zoom
        ? zoomAspectRatio(node.sample as any, aspectRatio)
        : aspectRatio,
      id: (node.sample as any)._id as string,
    };
  });

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
  const createLooker = fos.useCreateLooker(
    true,
    { ...opts, thumbnailTitle: (sample) => sample[groupField].name },
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

  const setSample = fos.useExpandSample();

  const select = fos.useSelectSample();
  const selectSample = useRef(select);
  selectSample.current = select;

  const [flashlight] = useState(() => {
    const flashlight = new Flashlight({
      horizontal: true,
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
    flashlight.attach(id);

    return () => flashlight.detach();
  }, [flashlight, id]);

  const updateItem = useRecoilTransaction_UNSTABLE(
    ({ get }) =>
      (id: string) => {
        store.lookers.get(id)?.updateOptions({
          ...opts,
          selected: get(fos.selectedSamples).has(id),
          highlight: get(fos.modal)?.sample._id === id,
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
    useRecoilValue(fos.modal),
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

const Group: React.FC = () => {
  const [height, setHeight] = useState(150);

  const theme = useTheme();

  return (
    <Resizable
      size={{ height, width: "100%" }}
      minHeight={200}
      maxHeight={300}
      enable={{
        top: false,
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
        borderBottom: `1px solid ${theme.backgroundDarkBorder}`,
      }}
      onResizeStop={(e, direction, ref, { height: delta }) => {
        setHeight(Math.max(height + delta, 100));
      }}
    >
      <Suspense fallback={<Loading>Pixelating...</Loading>}>
        <Column />
      </Suspense>
    </Resizable>
  );
};

export default Group;
