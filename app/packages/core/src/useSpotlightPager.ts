import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import { Response } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";
import { useMemo, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { VariablesOf, fetchQuery, useRelayEnvironment } from "react-relay";
import { RecoilValueReadOnly, useRecoilValue } from "recoil";
import { Subscription } from "relay-runtime";

const PAGE_SIZE = 20;

const processSamplePageData = (
  page: number,
  store: WeakMap<symbol, object>,
  data: fos.ResponseFrom<foq.paginateSamplesQuery>,
  schema: Schema,
  zoom: boolean,
  records: Set<string>
) => {
  return data.samples.edges.map((edge) => {
    if (edge.node.__typename === "%other") {
      throw new Error("unexpected sample type");
    }

    const id = Symbol(edge.node.id);
    store.set(id, edge.node);
    records.add(edge.node.id);

    return {
      key: page,
      aspectRatio: zoom
        ? zoomAspectRatio(edge.node.sample, schema, edge.node.aspectRatio)
        : edge.node.aspectRatio,
      id,
      data: edge.node,
    };
  });
};

export type Sample =
  fos.ResponseFrom<foq.paginateSamplesQuery>["samples"]["edges"][0]["node"];

const useSpotlightPager = (
  pageSelector: RecoilValueReadOnly<
    (page: number, pageSize: number) => VariablesOf<foq.paginateSamplesQuery>
  >,
  zoomSelector: RecoilValueReadOnly<boolean>
) => {
  const environment = useRelayEnvironment();
  const pager = useRecoilValue(pageSelector);
  const zoom = useRecoilValue(zoomSelector);
  const handleError = useErrorHandler();
  const store = useMemo(() => new WeakMap<symbol, Sample>(), []);
  const records = useRef(new Set<string>());
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const page = useMemo(() => {
    return async (pageNumber: number) => {
      const variables = pager(pageNumber, PAGE_SIZE);
      let subscription: Subscription;
      return new Promise<Response<number, Sample>>((resolve) => {
        subscription = fetchQuery<foq.paginateSamplesQuery>(
          environment,
          foq.paginateSamples,
          variables,
          { networkCacheConfig: {}, fetchPolicy: "store-or-network" }
        ).subscribe({
          next: (data) => {
            const items = processSamplePageData(
              pageNumber,
              store,
              data,
              schema,
              zoom,
              records.current
            );

            resolve({
              items,
              next: data.samples.pageInfo.hasNextPage ? pageNumber + 1 : null,
              previous: pageNumber > 0 ? pageNumber - 1 : null,
            });
          },
          complete: () => {
            subscription?.unsubscribe();
          },
          error: handleError,
        });
      });
    };
  }, [environment, handleError, pager, schema, store, zoom]);

  return { page, store, records };
};

export default useSpotlightPager;
