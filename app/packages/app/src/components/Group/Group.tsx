import { Scroller, Loading } from "@fiftyone/components";
import Flashlight, { Response } from "@fiftyone/flashlight";
import { Resizable } from "re-resizable";
import React, {
  MutableRefObject,
  Suspense,
  useEffect,
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

import { zoomAspectRatio } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import * as foq from "@fiftyone/relay";

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

const Column: React.FC<{
  fragmentRef: foq.paginateGroup_query$key;
}> = ({ fragmentRef }) => {
  const pageCount = useRef(0);
  const {
    data: { samples },
    hasNext,
    loadNext,
  } = usePaginationFragment(foq.paginateGroupPaginationFragment, fragmentRef);
  const store = fos.useLookerStore();
  const opts = fos.useLookerOptions(true);
  const createLooker = fos.useCreateLooker(true, opts, true);

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
  const run = useRecoilTransaction_UNSTABLE(
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
  const updates = useRef(run);
  updates.current = run;
  const flashlightRef = useRef<Flashlight<number>>();
  const setSample = fos.useExpandSample();

  const select = fos.useSelectSample();
  const selectSample = useRef(select);
  selectSample.current = select;

  return (
    <Scroller
      flashlightRef={flashlightRef}
      onItemClick={(next, id, items) => {
        const sample = store.samples.get(id);
        sample && setSample(sample);
      }}
      get={(page) => {
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
      }}
      render={(sampleId, element, dimensions, soft, hide) => {
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
              flashlightRef.current &&
                selectSample.current(flashlightRef.current, detail);
            }
          );

          store.lookers.set(sampleId, looker);

          looker.attach(element, dimensions);
        }
      }}
      horizontal={true}
      updateItems={[
        [
          useRecoilValueLoadable(
            fos.lookerOptions({ modal: true, withFilter: true })
          ),
          useRecoilValue(fos.modal),
          useRecoilValue(fos.selectedSamples),
        ],
        updates,
      ]}
    />
  );
};

const Group: React.FC<{
  queryRef: PreloadedQuery<foq.paginateGroupQuery>;
}> = ({ queryRef }) => {
  const [height, setHeight] = useState(150);
  const data = usePreloadedQuery<foq.paginateGroupQuery>(
    paginateGroup,
    queryRef
  );

  return (
    <Resizable
      size={{ height, width: "100%" }}
      minHeight={100}
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
      onResizeStop={(e, direction, ref, { height: delta }) => {
        setHeight(height + delta);
      }}
    >
      <Suspense fallback={<Loading>Pixelating...</Loading>}>
        <Column fragmentRef={data} />
      </Suspense>
    </Resizable>
  );
};

export default Group;
