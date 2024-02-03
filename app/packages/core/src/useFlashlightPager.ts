import { FlashlightConfig, Response } from "@fiftyone/flashlight";
import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useMemo, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { VariablesOf, fetchQuery, useRelayEnvironment } from "react-relay";
import { RecoilValueReadOnly, selector, useRecoilValue } from "recoil";

const PAGE_SIZE = 20;
class Weird {
  constructor() {}
}

const processSamplePageData = (
  store: WeakMap<symbol, object>,
  data: fos.ResponseFrom<foq.paginateSamplesQuery>,
  zoom: boolean
) => {
  return data.samples.edges.map((edge, i) => {
    if (edge.node.__typename === "%other") {
      throw new Error("unexpected sample type");
    }

    const id = Symbol(edge.node.id);
    store.set(id, edge.node);

    return {
      aspectRatio: zoom
        ? zoomAspectRatio(edge.node.sample, edge.node.aspectRatio)
        : edge.node.aspectRatio,
      id,
      data: { d: new Weird(), edge: edge.node },
    };
  });
};

const defaultZoom = selector({
  key: "defaultZoomCallback",
  get: () => async () => false,
});

const useFlashlightPager = (
  pageSelector: RecoilValueReadOnly<
    (page: number, pageSize: number) => VariablesOf<foq.paginateSamplesQuery>
  >,
  zoomSelector?: RecoilValueReadOnly<() => Promise<boolean>>
) => {
  const environment = useRelayEnvironment();
  const page = useRecoilValue(pageSelector);
  const zoom = useRecoilValue(zoomSelector || defaultZoom);
  const handleError = useErrorHandler();
  const store = useMemo(() => new WeakMap<symbol, object>(), []);

  const pager = useMemo(() => {
    return async (pageNumber: number) => {
      const variables = page(pageNumber, PAGE_SIZE);
      const zoomValue = await zoom();
      return new Promise<Response<number, object>>((resolve) => {
        const subscription = fetchQuery<foq.paginateSamplesQuery>(
          environment,
          foq.paginateSamples,
          variables,

          { networkCacheConfig: {}, fetchPolicy: "store-or-network" }
        ).subscribe({
          next: (data) => {
            const items = processSamplePageData(store, data, zoomValue);

            resolve({
              items,
              next: data.samples.pageInfo.hasNextPage ? pageNumber + 1 : null,
              previous: pageNumber > 0 ? pageNumber - 1 : null,
            });
            try {
              subscription.unsubscribe();
            } catch {}
          },
          error: handleError,
        });
      });
    };
  }, [environment, handleError, page, store, zoom]);

  const ref = useRef<FlashlightConfig<number, object>["get"]>(pager);
  ref.current = pager;

  return { page: ref, store };
};

export default useFlashlightPager;
