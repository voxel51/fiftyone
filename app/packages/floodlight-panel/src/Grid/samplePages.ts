/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Shared paging for inner horizontal Floodlight instances (group swimlanes,
 * field lanes, matrix cells): one `paginateSamples` request per page, nodes
 * registered in the shared sample store so the base renderer resolves them.
 */

import type { ID, ItemData, Response } from "@fiftyone/floodlight";
import * as foq from "@fiftyone/relay";
import type * as fos from "@fiftyone/state";
import {
  createOperationDescriptor,
  getRequest,
  type IEnvironment,
} from "relay-runtime";
import { fetchQuery } from "react-relay";
import type { VariablesOf } from "react-relay";
import type { SampleStore } from "./useSpotlightPager";
import {
  openOrder,
  type OpenedOrder,
  type OrderInput,
  UNORDERED,
} from "../order/order";
import { fetchPage, placePage, planPage } from "./orderedPages";
import { createPageCursors } from "./pageCursors";
import { handleNode } from "./utils";

/**
 * A page's `samples` variables by key; with an `input`, the pages are of
 * that order, by cursor, rather than skipped to.
 */
export type PageVariables = ((
  page: number,
  pageSize: number,
) => VariablesOf<foq.paginateSamplesQuery>) & { input?: OrderInput };

/**
 * Resolves with the page's connection, or `null` on a query timeout. An
 * abort unsubscribes the request and rejects.
 */
export const fetchSamplePage = (
  environment: IEnvironment,
  variables: VariablesOf<foq.paginateSamplesQuery>,
  signal?: AbortSignal,
) =>
  new Promise<foq.PaginateSamplesConnection | null>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const subscription = fetchQuery<foq.paginateSamplesQuery>(
      environment,
      foq.paginateSamples,
      variables,
      { fetchPolicy: "network-only" },
    ).subscribe({
      next: (data) =>
        resolve(
          foq.isPaginateSamplesConnection(data.samples) ? data.samples : null,
        ),
      complete: () => resolve(null),
      error: reject,
    });
    signal?.addEventListener("abort", () => {
      subscription.unsubscribe();
      reject(signal.reason);
    });
  });

/** Pages an inner strip keeps beyond those its live instances hold. */
export const STRIP_PAGES = 4;

/** Pages one inner instance reads before it is rebuilt at its anchor. */
export const STRIP_INSTANCE_PAGES = 20;

/**
 * Relay collects records only when a retained query is released, and
 * fetchQuery retains nothing, so dropping a page releases one to collect
 * the pages no query holds.
 */
export const collectPages = (environment: IEnvironment) =>
  environment
    .retain(createOperationDescriptor(getRequest(foq.paginateSamples), {}))
    .dispose();

/** An eviction callback that drops a page's records and its Relay data. */
export const forgetPage =
  (environment: IEnvironment, records: Map<string, number>) =>
  <P extends { items: { id: ID }[] }>(_key: number, page: P) => {
    for (const { id } of page.items) records.delete(id.description);
    collectPages(environment);
  };

const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 1;

/** Maps a connection's edges to Floodlight items, registering each node. */
export const connectionItems = (
  connection: foq.PaginateSamplesConnection,
  key: number,
  store: SampleStore,
  options: { aspectRatio?: number; skip?: string } = {},
): ItemData<number, fos.Sample>[] =>
  connection.edges.flatMap((edge) => {
    if (edge.node.__typename === "%other") return [];
    if (edge.node.id === options.skip) return [];

    const node = handleNode(edge.node);
    const id: ID = { description: node.id };
    store.set(id, node as unknown as { sample: fos.Sample; index: number });

    return [
      {
        key,
        aspectRatio: options.aspectRatio ?? finite(node.aspectRatio),
        id,
        data: node as fos.Sample,
      },
    ];
  });

/**
 * Caps concurrent page requests so many lazily mounted strips queue. A task
 * whose `signal` aborts while queued is dropped and never settles.
 */
export const createLimiter = (max: number) => {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    while (active < max && queue.length) queue.shift()?.();
  };

  return <T>(task: () => Promise<T>, signal?: AbortSignal) =>
    new Promise<T>((resolve, reject) => {
      if (signal?.aborted) return;
      const drop = () => {
        const index = queue.indexOf(run);
        index >= 0 && queue.splice(index, 1);
      };
      function run() {
        signal?.removeEventListener("abort", drop);
        active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      }
      signal?.addEventListener("abort", drop);
      queue.push(run);
      next();
    });
};

export type Limiter = ReturnType<typeof createLimiter>;

export type PageGetter = (
  page: number,
  signal?: AbortSignal,
) => Promise<Response<number, fos.Sample>>;

/**
 * Turns a variables factory into a page source's fetch. A strip with an
 * order input opens its order on its first page and pages it by cursor from
 * the start; a SMALL order also reaches any page by offset, for its rail.
 */
export const createPageGetter = ({
  aspectRatio,
  environment,
  limit,
  onPage,
  pageSize,
  store,
  variables,
}: {
  aspectRatio?: number;
  environment: IEnvironment;
  limit: Limiter;
  onPage?: (page: number, items: ItemData<number, fos.Sample>[]) => void;
  pageSize: number;
  store: SampleStore;
  variables: PageVariables;
}): PageGetter => {
  const cursors = createPageCursors();
  let order: Promise<OpenedOrder> | undefined;
  const opened = () => {
    const { input } = variables;
    if (!input) return Promise.resolve(UNORDERED);
    order ??= openOrder(environment, input, new AbortController().signal);
    return order;
  };

  return async (page, signal?: AbortSignal) => {
    const plan = planPage({
      cursors,
      key: page,
      order: await opened(),
      pageSize,
      variables,
    });
    const result =
      plan &&
      (await limit(
        () => fetchPage(environment, plan.variables, "network-only", signal),
        signal,
      ));
    if (!plan || !result || "timeout" in result) {
      onPage?.(page, []);
      return { items: [], next: null, previous: null };
    }

    const items = connectionItems(result.connection, page, store, {
      aspectRatio,
    });
    onPage?.(page, items);
    const { next, previous } = placePage(
      page,
      plan,
      result.connection,
      cursors,
      pageSize,
    );
    return { items, next, previous };
  };
};

/**
 * Keeps horizontal wheels in an inner strip and hands vertical wheels (and
 * horizontal ones past the strip's edge) to the outer scroller, since the
 * strip's `overscroll-behavior: contain` blocks native scroll chaining.
 */
export const routeWheel = (
  host: HTMLElement,
  outer: () => Element | null | undefined,
  // attach() appends the Floodlight scroller as the host's last child
  scroller: () => Element | null = () => host.lastElementChild,
) => {
  const handler = (event: WheelEvent) => {
    event.stopPropagation();
    const target = outer();
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY)) {
      event.preventDefault();
      target?.scrollBy(0, event.deltaY);
      return;
    }

    const inner = scroller();
    if (!inner) return;
    const room =
      event.deltaX > 0
        ? inner.scrollLeft + inner.clientWidth < inner.scrollWidth - 1
        : inner.scrollLeft > 0;
    if (!room) {
      event.preventDefault();
      target?.scrollBy(event.deltaX, 0);
    }
  };

  host.addEventListener("wheel", handler, { passive: false });
  return () => host.removeEventListener("wheel", handler);
};
