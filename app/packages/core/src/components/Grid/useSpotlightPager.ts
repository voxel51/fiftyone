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

  // Per-page cursor caches, used when `cursorPagination` is active so
  // page N's request can seek from page N±1's boundary. Spotlight only
  // knows about page numbers; the server's cursor-mode pagination needs
  // the previous edge's sort-field value to seek correctly.
  //
  //   pageEndCursors[N]   = last sample's sort value in page N
  //   pageStartCursors[N] = first sample's sort value in page N
  //
  // Forward fetch of page N (>0) uses pageEndCursors[N-1] as `after`;
  // backward fetch of page N (<0) uses pageStartCursors[N+1] as `before`.
  // Cleared alongside `pages` (same lifecycle).
  const pageEndCursors = useMemo(() => {
    clearRecords;
    return new Map<number, string>();
  }, [clearRecords]);
  const pageStartCursors = useMemo(() => {
    clearRecords;
    return new Map<number, string>();
  }, [clearRecords]);

  const page = useRecoilCallback(
    ({ snapshot }) => {
      // Decides whether the seeked origin (cursor-pagination page 0) has
      // any predecessors. We have the field's `[min, max]` bounds locally
      // — there's room behind the cursor iff its value is strictly past
      // the lower (ascending) or upper (descending) boundary. No extra
      // query needed.
      const canScrollBeforeCursor = async (vars: {
        after: string | null;
      }): Promise<boolean> => {
        const cursorStr = vars.after;
        if (cursorStr === null) return false;
        const cursor = Number(cursorStr);
        if (!Number.isFinite(cursor)) return false;
        const bounds = await snapshot.getPromise(fos.gridSortFieldBounds);
        if (!bounds) return false;
        const sort = await snapshot.getPromise(fos.gridSortBy);
        const [min, max] = bounds;
        return sort?.descending ? cursor < max : cursor > min;
      };
      return async (pageNumber: number) => {
        const variables = pager(pageNumber, PAGE_SIZE);
        type CursorVars = {
          cursorPagination?: boolean;
          after: string | null;
          before?: string | null;
        };
        const vars = variables as unknown as CursorVars;
        if (vars.cursorPagination && pageNumber > 0) {
          // Forward seek: thread the previous page's `endCursor` (a
          // sort-field value encoded as a string) into this request's
          // `after`. The default index-based encoding from
          // `pageParameters` (`page * pageSize - 1`) would be
          // misinterpreted by the server's cursor branch as a literal
          // sort value, so we must override it here.
          const prev = pageEndCursors.get(pageNumber - 1);
          if (prev !== undefined) vars.after = prev;
        } else if (vars.cursorPagination && pageNumber < 0) {
          // Backward seek: clear `after` and pass the start-cursor of
          // the page going-forward as `before`, so the server fetches
          // the N rows immediately preceding it.
          vars.after = null;
          const nextStart = pageStartCursors.get(pageNumber + 1);
          if (nextStart !== undefined) vars.before = nextStart;
        }
        let subscription: Subscription;
        const schema = await snapshot.getPromise(
          fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
        );

        // Resolve the seeked-origin "is there room backward?" check up
        // front so the synchronous subscription callback below doesn't
        // need to be async. Only meaningful for cursor page 0.
        const seekedOriginHasPrev =
          Boolean(vars.cursorPagination) && pageNumber === 0
            ? await canScrollBeforeCursor(vars)
            : false;

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

              // Cache this page's cursor boundaries so adjacent pages
              // (in either direction) can seek from them.
              if (connection.pageInfo.endCursor) {
                pageEndCursors.set(pageNumber, connection.pageInfo.endCursor);
              }
              if (connection.pageInfo.startCursor) {
                pageStartCursors.set(
                  pageNumber,
                  connection.pageInfo.startCursor
                );
              }

              // Under cursor pagination, the server reports
              // `hasPreviousPage` for backward fetches (negative pages).
              // For the seeked origin (page 0), the server has no way to
              // know without a second query — but the client already
              // has the sort-field bounds, so we can decide locally:
              // there's room behind the cursor iff the committed value
              // is past the boundary (min for ascending, max for desc).
              const cursorMode = Boolean(vars.cursorPagination);
              let hasPrev: boolean;
              if (!cursorMode) {
                hasPrev = pageNumber > 0;
              } else if (pageNumber === 0) {
                hasPrev = seekedOriginHasPrev;
              } else if (pageNumber > 0) {
                hasPrev = true;
              } else {
                hasPrev = connection.pageInfo.hasPreviousPage;
              }

              resolve({
                items,
                next: connection.pageInfo.hasNextPage ? pageNumber + 1 : null,
                previous: hasPrev ? pageNumber - 1 : null,
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
    [
      environment,
      handleError,
      handleTimeout,
      pageEndCursors,
      pageStartCursors,
      pager,
      store,
      zoom,
    ]
  );

  return { page, records, store };
};

export default useSpotlightPager;
