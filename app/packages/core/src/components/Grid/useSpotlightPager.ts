import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import type { ID, Response } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import type { Schema } from "@fiftyone/utilities";
import { useCallback, useMemo, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import type { VariablesOf } from "react-relay";
import { fetchQuery, useRelayEnvironment } from "react-relay";
import type { RecoilValueReadOnly } from "recoil";
import { useRecoilCallback, useRecoilValue } from "recoil";
import type { Subscription } from "relay-runtime";
import type { Records } from "./useRecords";
import useTimeout from "./useTimeout";
import { handleNode } from "./utils";

export const PAGE_SIZE = 20;

export type SampleStore = WeakMap<ID, { sample: fos.Sample; index: number }>;

const processSamplePageData = (
  page: number,
  store: WeakMap<ID, object>,
  data: fos.ResponseFrom<foq.paginateSamplesQuery>,
  schema: Schema,
  zoom: boolean,
  records: Map<string, number>,
) => {
  if (data.samples.__typename !== "SampleItemStrConnection") {
    throw new Error(
      `unexepcted typename ${data.samples.__typename}, expected 'SampleItemStrConnection'`,
    );
  }

  return data.samples.edges.map((edge, i) => {
    const node = handleNode(edge.node);
    const id = { description: node.id };

    store.set(id, node);
    records.set(node.id, page * PAGE_SIZE + i);

    return {
      key: page,
      aspectRatio: zoom
        ? zoomAspectRatio(node.sample, schema, node.aspectRatio)
        : node.aspectRatio,
      id,
      data: node as fos.Sample,
    };
  });
};

const useSpotlightPager = ({
  clearRecords,
  pageSelector,
  records,
  zoomSelector,
}: {
  clearRecords: string;
  pageSelector: RecoilValueReadOnly<
    (page: number, pageSize: number) => VariablesOf<foq.paginateSamplesQuery>
  >;
  records: Records;
  zoomSelector: RecoilValueReadOnly<boolean>;
}) => {
  const environment = useRelayEnvironment();
  const pager = useRecoilValue(pageSelector);
  const zoom = useRecoilValue(zoomSelector);
  const handleError = useErrorHandler();
  const store: SampleStore = useMemo(() => new WeakMap(), []);
  const handleTimeout = useTimeout();

  const keys = useRef(new Set<string>());

  const pages = useMemo(() => {
    /** Track already requested pages */
    clearRecords;
    return new Set<number>();
  }, [clearRecords]);

  const request = useRecoilCallback(
    ({ snapshot }) => {
      return async (pageNumber: number) => {
        const variables = pager(pageNumber, PAGE_SIZE);
        let subscription: Subscription;
        const schema = await snapshot.getPromise(
          fos.fieldSchema({ space: fos.State.SPACE.SAMPLE }),
        );

        // if a page has not been requested by this callback, require a network
        // request
        const fetchPolicy = pages.has(pageNumber)
          ? "store-or-network"
          : "network-only";
        pages.add(pageNumber);

        return new Promise<Response<number, fos.Sample>>((resolve) => {
          subscription = fetchQuery<foq.paginateSamplesQuery>(
            environment,
            foq.paginateSamples,
            variables,
            {
              networkCacheConfig: { metadata: {} },
              fetchPolicy,
            },
          ).subscribe({
            next: (data) => {
              if (data.samples.__typename !== "SampleItemStrConnection") {
                resolve({
                  items: [],
                  next: null,
                  previous: null,
                });
                data.samples.__typename === "QueryTimeout" &&
                  handleTimeout(data.samples.queryTime);
                return;
              }
              const items = processSamplePageData(
                pageNumber,
                store,
                data,
                schema,
                zoom,
                records,
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
    [environment, handleError, handleTimeout, pager, pages, store, zoom],
  );

  const pending = useMemo(() => {
    /** The prefetched next page, dropped along with the requested pages */
    pages;
    request;
    return new Map<number, Promise<Response<number, fos.Sample>>>();
  }, [pages, request]);

  /**
   * Serves a prefetched page when there is one, and prefetches the page after
   * it so that it is in flight while the current one is rendered
   */
  const page = useCallback(
    (pageNumber: number): Promise<Response<number, fos.Sample>> => {
      let response = pending.get(pageNumber);
      if (response) {
        pending.delete(pageNumber);
      } else {
        response = request(pageNumber);
      }

      const next = pageNumber + 1;
      if (!pages.has(next) && !pending.has(next)) {
        pending.set(next, request(next));
      }

      return response;
    },
    [pages, pending, request],
  );

  return { page, records, store };
};

export default useSpotlightPager;
