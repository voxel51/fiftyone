import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import { Response, SpotlightConfig } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";
import { useMemo, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { VariablesOf, fetchQuery, useRelayEnvironment } from "react-relay";
import { RecoilValueReadOnly, useRecoilValue } from "recoil";
import { defaultZoom } from "./useFlashlightPager";

const PAGE_SIZE = 20;

const processSamplePageData = (
  store: WeakMap<symbol, object>,
  data: fos.ResponseFrom<foq.paginateSamplesQuery>,
  schema: Schema,
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
        ? zoomAspectRatio(edge.node.sample, schema, edge.node.aspectRatio)
        : edge.node.aspectRatio,
      id,
      data: edge.node,
    };
  });
};

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
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

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
            const items = processSamplePageData(store, data, schema, zoomValue);

            resolve({
              items,
              next: data.samples.pageInfo.hasNextPage ? pageNumber + 1 : null,
              previous: pageNumber > 0 ? pageNumber - 1 : null,
            });

            subscription.closed && subscription.unsubscribe();
          },
          error: handleError,
        });
      });
    };
  }, [environment, handleError, page, schema, store, zoom]);

  const ref = useRef<SpotlightConfig<number, object>["get"]>(pager);
  ref.current = pager;

  return { page: ref, store };
};

export default useFlashlightPager;
