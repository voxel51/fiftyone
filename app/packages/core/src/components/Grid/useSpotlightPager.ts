import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import type { ID, Response } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import type { Schema } from "@fiftyone/utilities";
import { useEffect, useMemo, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import type { VariablesOf } from "react-relay";
import {
  commitLocalUpdate,
  fetchQuery,
  useRelayEnvironment,
} from "react-relay";
import type { RecoilValueReadOnly } from "recoil";
import { useRecoilCallback, useRecoilValue } from "recoil";
import type { Subscription } from "relay-runtime";
import type { Records } from "./useRecords";

export const PAGE_SIZE = 20;

const processSamplePageData = (
  page: number,
  store: WeakMap<ID, object>,
  data: fos.ResponseFrom<foq.paginateSamplesQuery>,
  schema: Schema,
  zoom: boolean,
  records: Map<string, number>
) => {
  return data.samples.edges.map((edge, i) => {
    if (edge.node.__typename === "%other") {
      throw new Error("unexpected sample type");
    }

    const id = { description: edge.node.id };
    store.set(id, edge.node);
    records.set(edge.node.id, page * PAGE_SIZE + i);

    return {
      key: page,
      aspectRatio: zoom
        ? zoomAspectRatio(edge.node.sample, schema, edge.node.aspectRatio)
        : edge.node.aspectRatio,
      id,
      data: edge.node as fos.Sample,
    };
  });
};

const useSpotlightPager = (
  {
    pageSelector,
    zoomSelector,
  }: {
    pageSelector: RecoilValueReadOnly<
      (page: number, pageSize: number) => VariablesOf<foq.paginateSamplesQuery>
    >;
    zoomSelector: RecoilValueReadOnly<boolean>;
  },
  records: Records
) => {
  const environment = useRelayEnvironment();
  const pager = useRecoilValue(pageSelector);
  const zoom = useRecoilValue(zoomSelector);
  const handleError = useErrorHandler();
  const store = useMemo(
    () => new WeakMap<ID, { sample: fos.Sample; index: number }>(),
    []
  );

  const keys = useRef(new Set<string>());

  const page = useRecoilCallback(
    ({ snapshot }) => {
      return async (pageNumber: number) => {
        const variables = pager(pageNumber, PAGE_SIZE);
        let subscription: Subscription;
        const schema = await snapshot.getPromise(
          fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
        );
        return new Promise<Response<number, fos.Sample>>((resolve) => {
          subscription = fetchQuery<foq.paginateSamplesQuery>(
            environment,
            foq.paginateSamples,
            variables,
            {
              networkCacheConfig: { metadata: {} },
              fetchPolicy: "store-or-network",
            }
          ).subscribe({
            next: (data) => {
              const items = processSamplePageData(
                pageNumber,
                store,
                data,
                schema,
                zoom,
                records
              );
              for (const item of items) keys.current.add(item.id.description);

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
    },
    [environment, handleError, pager, store, zoom]
  );

  const refresher = useRecoilValue(fos.refresher);

  useEffect(() => {
    refresher;
    const clear = () => {
      commitLocalUpdate(fos.getCurrentEnvironment(), (store) => {
        for (const id of keys.current) {
          store.get(id)?.invalidateRecord();
        }
      });
      keys.current.clear();
    };

    const unsubscribe = foq.subscribe(
      ({ event }) => event === "fieldVisibility" && clear()
    );

    return () => {
      clear();
      unsubscribe();
    };
  }, [refresher]);

  return { page, records, store };
};

export default useSpotlightPager;
