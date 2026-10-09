import { zoomAspectRatio } from "@fiftyone/looker";
import type * as foq from "@fiftyone/relay";
import type { ID, Response } from "@fiftyone/floodlight";
import * as fos from "@fiftyone/state";
import type { Schema } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRelayEnvironment } from "react-relay";
import {
  type ReverbValueReadOnly,
  useReverbCallback,
  useReverbValue,
} from "@fiftyone/reverb";
import { BoundedMap } from "../host/bounded";
import { PAGE_SIZE } from "../host/pageSource";
import type { OpenedOrder } from "../order/order";
import { MAX_CURSOR_PAGES, type OrderSeek } from "./pageCursors";
import {
  createCursorStore,
  fetchPage,
  type PageResult,
  type Placed,
  placePage,
  planPage,
  takeFirstPage,
} from "./orderedPages";
import type { Records } from "./useRecords";
import { collectPages, type PageVariables } from "./samplePages";
import usePanelMemo from "./panelMemory";
import useTimeout from "./useTimeout";
import { handleNode } from "./utils";

export { PAGE_SIZE };

export type SampleStore = WeakMap<ID, { sample: fos.Sample; index: number }>;

/** Where the grid's pages start: key 0 is the seek's page. */
export interface Origin {
  id: number;
  seek?: OrderSeek;
}

type Page = Response<number, fos.Sample>;

const EMPTY: Page = { items: [], next: null, previous: null };

const processSamplePageData = (
  page: number,
  store: WeakMap<ID, object>,
  connection: foq.PaginateSamplesConnection,
  schema: Schema,
  zoom: boolean,
  place: (index: number) => Placed,
  records: Records,
  fractions: Records,
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
    const { fraction, sequence } = place(i);
    records.set(node.id, sequence);
    fraction !== undefined && fractions.set(node.id, fraction);

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

/**
 * Pages the grid's order from `origin`: cursors chain keys either side of
 * the seek page, and a view the server cannot order pages by skip.
 */
const useSpotlightPager = ({
  clearRecords,
  clearRequests,
  fractions,
  order,
  origin,
  pageSelector,
  records,
  zoomSelector,
  aspectRatioOverride,
}: {
  clearRecords: string;
  /** Resets which pages were requested, so a refresh fetches from the network. */
  clearRequests: string;
  /** Sample id → place on the order's rail */
  fractions: Records;
  order: () => Promise<OpenedOrder>;
  origin: Origin;
  pageSelector: ReverbValueReadOnly<PageVariables>;
  records: Records;
  zoomSelector: ReverbValueReadOnly<boolean>;
  /** See {@link processSamplePageData}. */
  aspectRatioOverride?: number;
}) => {
  const environment = useRelayEnvironment();
  const variables = useReverbValue(pageSelector);
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
  const cursorsFor = usePanelMemo(
    "pageCursors",
    clearRecords,
    createCursorStore,
  );

  /** Drops what a page left behind once the panel's pages let it go. */
  const forget = useCallback(
    (pageNumber: number) => {
      pages.delete(pageNumber);
      collectPages(environment);
    },
    [environment, pages],
  );

  const page = useReverbCallback(
    ({ snapshot }) =>
      async (key: number, signal?: AbortSignal): Promise<Page> => {
        const opened = await order();
        const cursors = cursorsFor(
          opened.kind === "order" ? opened.token : "",
          origin.id,
        );
        const plan = planPage({
          cursors,
          key,
          order: opened,
          pageSize: PAGE_SIZE,
          seek: origin.seek,
          variables,
        });
        if (!plan) return EMPTY;

        const schema = await snapshot.getPromise(
          fos.fieldSchema({ space: fos.State.SPACE.SAMPLE }),
        );
        // the open's first page, else a page this panel has not requested
        // comes from the network
        const first = takeFirstPage(opened, plan);
        const fetchPolicy = pages.has(key)
          ? "store-or-network"
          : "network-only";
        pages.set(key, true);
        const result: PageResult | undefined = first
          ? { connection: first }
          : await fetchPage(
              environment,
              plan.variables,
              fetchPolicy,
              signal,
            ).catch((error) => {
              if (signal?.aborted) throw error;
              handleError(error);
              return undefined;
            });
        if (!result) return EMPTY;
        if ("timeout" in result) {
          result.timeout && handleTimeout(result.timeout);
          return EMPTY;
        }

        const placed = placePage(
          key,
          plan,
          result.connection,
          cursors,
          PAGE_SIZE,
        );
        const items = processSamplePageData(
          key,
          store,
          result.connection,
          schema,
          zoom,
          placed.place,
          records,
          fractions,
          aspectRatioOverride,
        );

        return { items, next: placed.next, previous: placed.previous };
      },
    [
      aspectRatioOverride,
      cursorsFor,
      environment,
      fractions,
      handleError,
      handleTimeout,
      order,
      origin,
      pages,
      records,
      store,
      variables,
      zoom,
    ],
  );

  return { forget, page, records, store };
};

export default useSpotlightPager;
