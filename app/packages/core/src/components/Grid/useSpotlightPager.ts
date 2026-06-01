import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import type { ID, Response } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import type { Schema } from "@fiftyone/utilities";
import { useMemo, useRef } from "react";
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
  connection: foq.PaginateSamplesConnection,
  schema: Schema,
  zoom: boolean,
  records: Map<string, number>
) => {
  return connection.edges.flatMap((edge, i) => {
    // Filter out unknown union variants so `handleNode` only ever sees the
    // known sample types. `PaginateSamplesNode` excludes `%other`; the cast
    // below is safe by the typeguard, but TS can't narrow `edge.node` through
    // the function boundary without the explicit early-return.
    if (edge.node.__typename === "%other") return [];

    const node = handleNode(edge.node);
    const id = { description: node.id };

    store.set(id, node);
    records.set(node.id, page * PAGE_SIZE + i);

    return [
      {
        key: page,
        aspectRatio: zoom
          ? zoomAspectRatio(node.sample, schema, node.aspectRatio)
          : node.aspectRatio,
        id,
        data: node as fos.Sample,
      },
    ];
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
    return new Set();
  }, [clearRecords]);

  const page = useRecoilCallback(
    ({ snapshot }) => {
      return async (pageNumber: number) => {
        const variables = pager(pageNumber, PAGE_SIZE);
        let subscription: Subscription;
        const schema = await snapshot.getPromise(
          fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
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
            }
          ).subscribe({
            next: (data) => {
              if (!foq.isPaginateSamplesConnection(data.samples)) {
                resolve({
                  items: [],
                  next: null,
                  previous: null,
                });
                if (data.samples.__typename === "QueryTimeout") {
                  handleTimeout(data.samples.queryTime);
                }
                return;
              }

              const connection = data.samples;
              const items = processSamplePageData(
                pageNumber,
                store,
                connection,
                schema,
                zoom,
                records
              );
              for (const item of items) keys.current.add(item.id.description);

              resolve({
                items,
                next: connection.pageInfo.hasNextPage ? pageNumber + 1 : null,
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
    [environment, handleError, handleTimeout, pager, store, zoom]
  );

  return { page, records, store };
};

export default useSpotlightPager;
