import type { Response } from "@fiftyone/floodlight";
import type * as foq from "@fiftyone/relay";
import { planPage, placePage } from "../Grid/orderedPages";
import {
  createPageCursors,
  type OrderSeek,
  pageWindow,
} from "../Grid/pageCursors";
import { PAGE_SIZE } from "../host/pageSource";
import type { Order } from "../order/order";
import type { FakeItem } from "./fakePages";

type Page = Response<number, FakeItem["data"]>;

/** Samples in the fake order; sample i sits at fraction i / N. */
export const N = 2000;

export interface Sent {
  variables: Record<string, unknown>;
  signal: AbortSignal;
}

/**
 * An INDEXED order of N samples whose fractions are i / N, answering
 * `samples` variables the way the server does: a seek starts at the first
 * sample at or past its fraction, a cursor pages after or before it.
 */
export const createServer = (latency: number) => {
  const sent: Sent[] = [];
  const answer = (variables: Record<string, unknown>) => {
    const count = variables.count as number;
    const seek = variables.seek as OrderSeek | null;
    const after = variables.after as string | null;
    const before = variables.before as string | null;
    let start: number;
    if (seek) start = Math.ceil((seek.fraction ?? 0) * N);
    else if (before !== null) start = Math.max(0, Number(before) - count);
    else start = after === null ? 0 : Number(after) + 1;
    const end = before !== null ? Number(before) : Math.min(N, start + count);
    const edges = [];
    for (let i = start; i < end; i++) {
      edges.push({
        cursor: String(i),
        fraction: i / N,
        offset: null,
        value: i / N,
        node: { id: `s${i}` },
      });
    }
    return {
      edges,
      pageInfo: {
        hasNextPage: end < N,
        hasPreviousPage: start > 0,
        startCursor: edges.length ? String(start) : null,
        endCursor: edges.length ? String(end - 1) : null,
      },
    } as unknown as foq.PaginateSamplesConnection;
  };
  const fetch = (variables: Record<string, unknown>, signal: AbortSignal) =>
    new Promise<foq.PaginateSamplesConnection>((resolve, reject) => {
      sent.push({ variables, signal });
      const timer = setTimeout(() => resolve(answer(variables)), latency);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
  /** An order open: one request, carrying the first page when asked. */
  const open = (count?: number) =>
    new Promise<foq.PaginateSamplesConnection | undefined>((resolve) => {
      sent.push({
        variables: { open: true, count },
        signal: new AbortController().signal,
      });
      setTimeout(
        () =>
          resolve(
            count === undefined
              ? undefined
              : answer({ count, after: null, before: null, seek: null }),
          ),
        latency,
      );
    });
  return { fetch, open, sent };
};

/**
 * The panel's pager for one origin: it awaits the order's open, takes the
 * open's first page for the start page when there is one, and otherwise
 * fetches by the order's cursors, seek and places.
 */
export const pagerFor = (
  server: ReturnType<typeof createServer>,
  opened: Order,
  seek: OrderSeek | undefined,
  fractions: Map<string, number>,
  {
    open = async () => undefined,
    pageSize = PAGE_SIZE,
  }: {
    /** The order's open; resolves with its first page when it reads one. */
    open?: () => Promise<foq.PaginateSamplesConnection | undefined>;
    pageSize?: number;
  } = {},
) => {
  const cursors = createPageCursors();
  let seeded = false;
  return async (key: number, signal: AbortSignal): Promise<Page> => {
    const first = await open();
    const plan = planPage({
      cursors,
      key,
      order: opened,
      pageSize,
      seek,
      variables: (page, size) =>
        ({ dataset: "d", ...pageWindow(page, size) }) as never,
    });
    if (!plan) return { items: [], next: null, previous: null };
    const start = key === 0 && !seek && first && !seeded;
    if (start) seeded = true;
    const connection = start
      ? first
      : await server.fetch(plan.variables as Record<string, unknown>, signal);
    const placed = placePage(key, plan, connection, cursors, pageSize);
    const items = connection.edges.map((edge, index) => {
      const id = (edge.node as unknown as { id: string }).id;
      fractions.set(id, placed.place(index).fraction ?? 0);
      return {
        aspectRatio: 1,
        data: { page: key, index },
        id: { description: id },
        key,
      };
    });
    return { items, next: placed.next, previous: placed.previous };
  };
};
