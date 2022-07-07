import { Scroller, Loading } from "@fiftyone/components";
import { Response } from "@fiftyone/flashlight";
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
  paginateGroup,
  paginateGroupPaginationFragment,
  paginateGroupQuery,
  paginateGroup_query$data,
  paginateGroup_query$key,
} from "../../queries";
import { zoomAspectRatio } from "@fiftyone/looker";
import useLookerStore, { LookerStore } from "../../hooks/useLookerStore";
import useCreateLooker from "../../hooks/useCreateLooker";
import { useLookerOptions } from "../../recoil/looker";

const process = (
  next: MutableRefObject<number>,
  store: LookerStore<any>,
  zoom: boolean,
  edges: paginateGroup_query$data["samples"]["edges"]
) =>
  edges.map(({ node }) => {
    if (node.__typename === "%other") {
      throw new Error("invalid response");
    }
    const data = {
      sample: node.sample,
      dimensions: [node.width, node.height],
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
  fragmentRef: paginateGroup_query$key;
}> = ({ fragmentRef }) => {
  const pageCount = useRef(0);
  const {
    data: { samples },
    hasNext,
    loadNext,
  } = usePaginationFragment(paginateGroupPaginationFragment, fragmentRef);
  const store = useLookerStore();
  const createLooker = useCreateLooker(true, useLookerOptions(true));

  const hasNextRef = useRef(true);
  hasNextRef.current = hasNext;
  const countRef = useRef(0);

  const resolveRef = useRef<(value: Response<number>) => void>();

  useEffect(() => {
    if (resolveRef.current && countRef.current !== samples.edges.length) {
      countRef.current = samples.edges.length;
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
    }
  }, [samples]);

  return (
    <Scroller
      get={(page) => {
        pageCount.current = page + 1;
        if (pageCount.current === 1) {
          return Promise.resolve({
            items: process(countRef, store, false, samples.edges),
            nextRequestKey: hasNext ? pageCount.current : null,
          });
        } else {
          loadNext(20);
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
            ({ detail }: { detail: string }) => null
          );

          store.lookers.set(sampleId, looker);

          looker.attach(element, dimensions);
        }
      }}
      horizontal={true}
    />
  );
};

const Group: React.FC<{
  queryRef: PreloadedQuery<paginateGroupQuery>;
}> = ({ queryRef }) => {
  const [width, setWidth] = useState(200);
  const data = usePreloadedQuery<paginateGroupQuery>(paginateGroup, queryRef);

  return (
    <Resizable
      size={{ height: "100%", width }}
      minWidth={200}
      maxWidth={600}
      enable={{
        top: false,
        right: false,
        bottom: false,
        left: true,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      onResizeStop={(e, direction, ref, { width: delta }) => {
        setWidth(width + delta);
      }}
    >
      <Suspense fallback={<Loading>Voxelating</Loading>}>
        <Column fragmentRef={data} />
      </Suspense>
    </Resizable>
  );
};

export default Group;
