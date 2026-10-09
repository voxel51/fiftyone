import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import type { ID, Response } from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import type { Schema } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useErrorHandler } from "react-error-boundary";
import type { VariablesOf } from "react-relay";
import { fetchQuery, useRelayEnvironment } from "react-relay";
import {
  type ReverbValueReadOnly,
  useReverbCallback,
  useReverbValue,
} from "@fiftyone/reverb";
import type { Subscription } from "relay-runtime";
import { BoundedMap } from "../host/bounded";
import {
  cursorLinks,
  createPageCursors,
  MAX_CURSOR_PAGES,
  forgetCursors,
  seekFor,
} from "./pageCursors";
import type { Records } from "./useRecords";
import { collectPages } from "./samplePages";
import usePanelMemo from "./panelMemory";
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
  records: Map<string, number>,
  // When set, every item's `aspectRatio` is replaced with this value
  // before being handed to Spotlight. The native ratio is preserved on
  // the stored sample for downstream consumers (e.g. the swimlane
  // renderer reads it back to size the cover). Used by swimlanes to
  // make each row uniformly short instead of taking the cover's full
  // image height.
  aspectRatioOverride?: number,
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

    const nativeAspectRatio = zoom
      ? zoomAspectRatio(node.sample, schema, node.aspectRatio)
      : node.aspectRatio;

    return [
      {
        key: page,
        aspectRatio: aspectRatioOverride ?? nativeAspectRatio,
        id,
        data: node as fos.Sample,
      },
    ];
  });
};

const useSpotlightPager = ({
  clearRecords,
  clearRequests,
  pageSelector,
  records,
  zoomSelector,
  aspectRatioOverride,
}: {
  clearRecords: string;
  /** Resets which pages were requested, so a refresh fetches from the network. */
  clearRequests: string;
  pageSelector: ReverbValueReadOnly<
    (page: number, pageSize: number) => VariablesOf<foq.paginateSamplesQuery>
  >;
  records: Records;
  zoomSelector: ReverbValueReadOnly<boolean>;
  /** See {@link processSamplePageData}. */
  aspectRatioOverride?: number;
}) => {
  const environment = useRelayEnvironment();
  const pager = useReverbValue(pageSelector);
  const zoom = useReverbValue(zoomSelector);
  const handleError = useErrorHandler();
  // held with the panel's pages, whose items it resolves
  const store: SampleStore = usePanelMemo(
    "store",
    clearRecords,
    () => new WeakMap(),
  );
  const handleTimeout = useTimeout();

  /** Track already requested pages, across mounts in this panel */
  const pages = usePanelMemo(
    "pages",
    clearRequests,
    () => new BoundedMap<number, true>(MAX_CURSOR_PAGES),
  );
  // cleared alongside `pages` (same lifecycle)
  const cursors = usePanelMemo("pageCursors", clearRequests, createPageCursors);

  /** Drops what a page left behind once the panel's pages let it go. */
  const forget = useCallback(
    (pageNumber: number) => {
      pages.delete(pageNumber);
      forgetCursors(cursors, pageNumber);
      collectPages(environment);
    },
    [cursors, environment, pages],
  );

  const page = useReverbCallback(
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
      return async (pageNumber: number, signal?: AbortSignal) => {
        const variables = pager(pageNumber, PAGE_SIZE);
        type CursorVars = {
          cursorPagination?: boolean;
          after: string | null;
          before?: string | null;
        };
        const vars = variables as unknown as CursorVars;
        const cursorMode = Boolean(vars.cursorPagination);
        // The default index-based `after` from `pageParameters`
        // (`page * pageSize - 1`) would be misinterpreted by the server's
        // cursor branch as a literal sort value, so a neighbor's boundary
        // replaces it.
        const seek = cursorMode ? seekFor(cursors, pageNumber) : undefined;
        if (seek && "after" in seek) vars.after = seek.after;
        if (seek && "before" in seek) {
          vars.after = null;
          vars.before = seek.before;
        }
        if (cursorMode && pageNumber < 0 && !seek) vars.after = null;
        let subscription: Subscription | undefined;
        const schema = await snapshot.getPromise(
          fos.fieldSchema({ space: fos.State.SPACE.SAMPLE }),
        );

        // Resolve the seeked-origin "is there room backward?" check up
        // front so the synchronous subscription callback below doesn't
        // need to be async. Only meaningful for cursor page 0.
        const seekedOriginHasPrev =
          cursorMode && pageNumber === 0
            ? await canScrollBeforeCursor(vars)
            : false;

        // if a page has not been requested by this callback, require a network
        // request
        const fetchPolicy = pages.has(pageNumber)
          ? "store-or-network"
          : "network-only";

        return new Promise<Response<number, fos.Sample>>((resolve, reject) => {
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }
          signal?.addEventListener("abort", () => {
            subscription?.unsubscribe();
            reject(signal.reason);
          });
          pages.set(pageNumber, true);
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
                records,
                aspectRatioOverride,
              );

              // Cache this page's cursor boundaries so adjacent pages
              // (in either direction) can seek from them.
              const { endCursor, startCursor } = connection.pageInfo;
              endCursor && cursors.ends.set(pageNumber, endCursor);
              startCursor && cursors.starts.set(pageNumber, startCursor);

              const links = cursorMode
                ? cursorLinks({
                    hasNext: connection.pageInfo.hasNextPage,
                    hasPrevious: connection.pageInfo.hasPreviousPage,
                    originHasPrevious: seekedOriginHasPrev,
                    page: pageNumber,
                    seek,
                  })
                : {
                    next: connection.pageInfo.hasNextPage
                      ? pageNumber + 1
                      : null,
                    previous: pageNumber > 0 ? pageNumber - 1 : null,
                  };

              resolve({ items, ...links });
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
      aspectRatioOverride,
      cursors,
      environment,
      handleError,
      handleTimeout,
      pager,
      pages,
      store,
      zoom,
    ],
  );

  return { forget, page, records, store };
};

export default useSpotlightPager;
