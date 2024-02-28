import { FlashlightConfig, Response } from "@fiftyone/flashlight";
import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";
import { useMemo, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { VariablesOf, fetchQuery, useRelayEnvironment } from "react-relay";
import { RecoilValueReadOnly, selector, useRecoilValue } from "recoil";

const PAGE_SIZE = 20;

const processSamplePageData = (
  offset: number,
  store: fos.LookerStore<fos.Lookers>,
  data: fos.ResponseFrom<foq.paginateSamplesQuery>,
  schema: Schema,
  zoom?: boolean
) => {
  return data.samples.edges.map((edge, i) => {
    if (edge.node.__typename === "%other") {
      throw new Error("unexpected sample type");
    }

    const node = edge.node as fos.ModalSample;
    store.samples.set(node.sample._id, node);
    store.indices.set(offset + i, node.sample._id);

    return {
      aspectRatio: zoom
        ? zoomAspectRatio(edge.node.sample, schema, edge.node.aspectRatio)
        : edge.node.aspectRatio,
      id: edge.node.id,
    };
  });
};

const defaultZoom = selector({
  key: "defaultZoomCallback",
  get: () => async () => false,
});

const useFlashlightPager = (
  store: fos.LookerStore<fos.Lookers>,
  pageSelector: RecoilValueReadOnly<
    (page: number, pageSize: number) => VariablesOf<foq.paginateSamplesQuery>
  >,
  zoomSelector?: RecoilValueReadOnly<() => Promise<boolean>>
) => {
  const environment = useRelayEnvironment();
  const page = useRecoilValue(pageSelector);
  const zoom = useRecoilValue(zoomSelector || defaultZoom);
  const [isEmpty, setIsEmpty] = useState(false);
  const handleError = useErrorHandler();
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const pager = useMemo(() => {
    return async (pageNumber: number) => {
      const variables = page(pageNumber, PAGE_SIZE);
      const zoomValue = await zoom();
      return new Promise<Response<number>>((resolve) => {
        const subscription = fetchQuery<foq.paginateSamplesQuery>(
          environment,
          foq.paginateSamples,
          variables
        ).subscribe({
          next: (data) => {
            const items = processSamplePageData(
              pageNumber * PAGE_SIZE,
              store,
              data,
              schema,
              zoomValue
            );

            subscription.unsubscribe();
            !pageNumber && setIsEmpty(!items.length);

            resolve({
              items,
              nextRequestKey: data.samples.pageInfo.hasNextPage
                ? pageNumber + 1
                : null,
            });
          },
          error: handleError,
        });
      });
    };
  }, [environment, handleError, page, schema, store, zoom]);

  const ref = useRef<FlashlightConfig<number>["get"]>(pager);
  ref.current = pager;

  return {
    isEmpty,
    reset: page,
    page: (page: number) => ref.current(page),
  };
};

export default useFlashlightPager;
