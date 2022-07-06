import { ColumnScroller, Loading } from "@fiftyone/components";
import { Response } from "@fiftyone/flashlight";
import { Resizable } from "re-resizable";
import React, { Suspense, useEffect, useRef, useState } from "react";
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
import createStore from "../FlashlightLooker/createStore";
import { zoomAspectRatio } from "@fiftyone/looker";

const store = createStore();

const process = (zoom: boolean,edges: paginateGroup_query$data["samples"]["edges"]) =>
  edges.map(({ node }) => {
    if (node.__typename === "%other") {
      throw new Error("invalid response");
    }

    const aspectRatio = node.width / node.height'
    return {
      aspectRatio:  zoom
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

  const hasNextRef = useRef(true);
  hasNextRef.current = hasNext;
  const countRef = useRef(0);

  const resolveRef = useRef<(value: Response<number>) => void>();

  useEffect(() => {
    if (resolveRef.current && countRef.current !== samples.edges.length) {
      countRef.current = samples.edges.length;
      pageCount.current += 1;
      resolveRef.current({
        items: process(samples.edges.slice(countRef.current)),
        nextRequestKey: pageCount.current,
      });
    }
  }, [samples]);

  return (
    <ColumnScroller
      get={(page) => {
        pageCount.current = page + 1;
        if (pageCount.current === 1) {
          return Promise.resolve({
            items: process(samples.edges),
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

        if (store.lookers.has(sampleId)) {
          const looker = store.lookers.get(sampleId);
          hide ? looker.disable() : looker.attach(element, dimensions);

          return;
        }

        if (!soft) {
          const looker = lookerGeneratorRef.current(result);
          looker.addEventListener(
            "selectthumbnail",
            ({ detail }: { detail: string }) => null
          );

          store.lookers.set(sampleId, looker);
          looker.attach(element, dimensions);
        }
      }}
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
