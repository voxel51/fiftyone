/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Shared paging for inner horizontal Floodlight instances (group swimlanes,
 * field lanes, matrix cells): one `paginateSamples` request per page, nodes
 * registered in the shared sample store so the base renderer resolves them.
 */

import type { Get, ID, ItemData } from "@fiftyone/floodlight";
import * as foq from "@fiftyone/relay";
import type * as fos from "@fiftyone/state";
import type { IEnvironment } from "relay-runtime";
import { fetchQuery } from "react-relay";
import type { VariablesOf } from "react-relay";
import type { SampleStore } from "./useSpotlightPager";
import { handleNode } from "./utils";

export type PageVariables = (
  page: number,
  pageSize: number,
) => VariablesOf<foq.paginateSamplesQuery>;

/** Resolves with the page's connection, or `null` on a query timeout. */
export const fetchSamplePage = async (
  environment: IEnvironment,
  variables: VariablesOf<foq.paginateSamplesQuery>,
) => {
  const data = await fetchQuery<foq.paginateSamplesQuery>(
    environment,
    foq.paginateSamples,
    variables,
    { fetchPolicy: "network-only" },
  ).toPromise();

  return data && foq.isPaginateSamplesConnection(data.samples)
    ? data.samples
    : null;
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

/** Caps concurrent page requests so many lazily mounted strips queue. */
export const createLimiter = (max: number) => {
  let active = 0;
  const queue: (() => void)[] = [];

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
};

export type Limiter = ReturnType<typeof createLimiter>;

/** Turns a variables factory into a Floodlight `get`. */
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
}): Get<number, fos.Sample> => {
  return async (page) => {
    const connection = await limit(() =>
      fetchSamplePage(environment, variables(page, pageSize)),
    );
    const items = connection
      ? connectionItems(connection, page, store, { aspectRatio })
      : [];
    onPage?.(page, items);

    return {
      items,
      next: connection?.pageInfo.hasNextPage ? page + 1 : null,
      previous: page > 0 ? page - 1 : null,
    };
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
) => {
  const handler = (event: WheelEvent) => {
    event.stopPropagation();
    const target = outer();
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY)) {
      event.preventDefault();
      target?.scrollBy(0, event.deltaY);
      return;
    }

    // attach() appends the Floodlight scroller as the host's last child
    const inner = host.lastElementChild;
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
