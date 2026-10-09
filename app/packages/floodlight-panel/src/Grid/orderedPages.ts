/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Fetching one page key of an order: which request addresses it, the
 * `samples` variables for it, and where its items sit.
 */

import * as foq from "@fiftyone/relay";
import type { VariablesOf } from "react-relay";
import { fetchQuery } from "react-relay";
import type { IEnvironment } from "relay-runtime";
import { BoundedMap } from "../host/bounded";
import { firstPageArgs, type OpenedOrder } from "../order/order";
import {
  createPageCursors,
  type OrderSeek,
  type PageCursors,
  pageLinks,
  pageRequest,
  type PageRequest,
  pageSequence,
  rememberCursors,
  requestVariables,
} from "./pageCursors";
import type { PageVariables } from "./samplePages";

type Variables = VariablesOf<foq.paginateSamplesQuery>;

export interface PagePlan {
  variables: Variables;
  /** How an order's page is addressed; none for a skip page */
  request?: PageRequest;
}

/**
 * The variables for page `key`: an order's cursor, seek or offset, or a
 * skip page of a view the server cannot order. Undefined when nothing
 * addresses the key.
 */
export const planPage = ({
  cursors,
  key,
  order,
  pageSize,
  seek,
  variables,
}: {
  cursors: PageCursors;
  key: number;
  order: OpenedOrder;
  pageSize: number;
  seek?: OrderSeek;
  variables: PageVariables;
}): PagePlan | undefined => {
  if (order.kind === "unordered") {
    return key < 0 ? undefined : { variables: variables(key, pageSize) };
  }

  const request = pageRequest({
    cursors,
    key,
    mode: order.mode,
    pageSize,
    seek,
  });
  if (!request) return undefined;
  return {
    request,
    variables: {
      ...variables(0, pageSize),
      ...(requestVariables(request) as Pick<
        Variables,
        "after" | "before" | "seek"
      >),
      order: order.token,
    },
  };
};

export interface Placed {
  /** Consecutive across the pages of one origin */
  sequence: number;
  /** Place on the order's rail, when it has one */
  fraction?: number;
}

/**
 * Where each edge of a fetched page sits, its links, and the page's cursors
 * remembered for its neighbors.
 */
export const placePage = (
  key: number,
  plan: PagePlan,
  connection: foq.PaginateSamplesConnection,
  cursors: PageCursors,
  pageSize: number,
) => {
  const { edges, pageInfo } = connection;
  const { request } = plan;
  if (!request) {
    return {
      next: pageInfo.hasNextPage ? key + 1 : null,
      previous: key > 0 ? key - 1 : null,
      place: (index: number): Placed => ({ sequence: key * pageSize + index }),
    };
  }

  rememberCursors(cursors, key, pageInfo);
  const sequence = pageSequence(key, request, pageSize, edges.length);
  return {
    ...pageLinks(key, request, {
      hasNext: pageInfo.hasNextPage,
      hasPrevious: pageInfo.hasPreviousPage,
    }),
    place: (index: number): Placed => {
      const { fraction, offset } = edges[index];
      return {
        sequence: offset ?? sequence(index),
        fraction: fraction ?? undefined,
      };
    },
  };
};

/**
 * Cursors per order and origin: a new sort, refresh or jump pages from new
 * boundaries, and the last few are kept for a return to them.
 */
export const createCursorStore = () => {
  const stores = new BoundedMap<string, PageCursors>(4);
  return (token: string, origin: number) => {
    const key = `${token}|${origin}`;
    let cursors = stores.get(key);
    if (!cursors) {
      cursors = createPageCursors();
      stores.set(key, cursors);
    }
    return cursors;
  };
};

/**
 * The first page the order's open returned, for the start page planned with
 * the same arguments. It is taken once: a later read of the page fetches it.
 */
export const takeFirstPage = (
  order: OpenedOrder,
  plan: PagePlan,
): foq.PaginateSamplesConnection | undefined => {
  if (order.kind !== "order" || !order.first) return undefined;
  const { request, variables } = plan;
  if (!request || !("after" in request) || request.after !== null) {
    return undefined;
  }
  const { args, connection } = order.first;
  order.first = undefined;
  const same =
    JSON.stringify(args) ===
    JSON.stringify(firstPageArgs(variables as Record<string, unknown>));
  return same ? connection : undefined;
};

export type PageResult =
  | { connection: foq.PaginateSamplesConnection }
  | { timeout: number };

/** An order query that ran past the server's budget, as a timeout. */
const budgetExceeded = (error: unknown) =>
  (error as { errors?: { extensions?: { code?: string } }[] })?.errors?.some(
    ({ extensions }) => extensions?.code === "BUDGET_EXCEEDED",
  );

/** Order queries are limited to ten seconds on the server. */
export const ORDER_BUDGET_SECONDS = 10;

/**
 * Fetches a page; an abort unsubscribes, which cancels the request and the
 * server's queries for it.
 */
export const fetchPage = (
  environment: IEnvironment,
  variables: VariablesOf<foq.paginateSamplesQuery>,
  fetchPolicy: "network-only" | "store-or-network",
  signal?: AbortSignal,
) =>
  new Promise<PageResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const subscription = fetchQuery<foq.paginateSamplesQuery>(
      environment,
      foq.paginateSamples,
      variables,
      { networkCacheConfig: { metadata: {} }, fetchPolicy },
    ).subscribe({
      next: ({ samples }) => {
        if (foq.isPaginateSamplesConnection(samples)) {
          resolve({ connection: samples });
        } else {
          resolve({
            timeout:
              samples.__typename === "QueryTimeout" ? samples.queryTime : 0,
          });
        }
      },
      error: (error: unknown) =>
        budgetExceeded(error)
          ? resolve({ timeout: ORDER_BUDGET_SECONDS })
          : reject(error),
    });
    signal?.addEventListener("abort", () => {
      subscription.unsubscribe();
      reject(signal.reason);
    });
  });
