import type { Response } from "@fiftyone/floodlight";
import type * as foq from "@fiftyone/relay";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { planPage, placePage } from "../Grid/orderedPages";
import {
  createPageCursors,
  type OrderSeek,
  pageWindow,
} from "../Grid/pageCursors";
import { gridRailMode, isRailed } from "../Grid/railModes";
import { warmKeys } from "../Grid/warming";
import { createPageSource, PAGE_SIZE } from "../host/pageSource";
import type { Order } from "../order/order";
import { type Environment, installEnvironment } from "./environment";
import type { FakeItem } from "./fakePages";
import { mountHost } from "./mountHost";

type Page = Response<number, FakeItem["data"]>;

const N = 2000;
const LATENCY = 40;
const SIZE = { width: 1028, height: 600 };

let env: Environment;

beforeEach(() => {
  env = installEnvironment(SIZE);
});

afterEach(() => {
  env.restore();
  document.body.innerHTML = "";
});

const order = (scale: "NUMBER" | "ID"): Order => ({
  kind: "order",
  token: "token",
  mode: "INDEXED",
  total: null,
  // ids bound an unsorted order: hex, seconds first, as the server sends them
  bounds:
    scale === "ID"
      ? {
          min: `${"0".repeat(8)}${"a".repeat(16)}`,
          max: `000007d0${"a".repeat(16)}`,
          scale,
        }
      : { min: 0, max: 1, scale },
  desc: false,
  ticks: [],
});

interface Sent {
  variables: Record<string, unknown>;
  signal: AbortSignal;
}

/**
 * An INDEXED order of N samples whose fractions are i / N, answering
 * `samples` variables the way the server does: a seek starts at the first
 * sample at or past its fraction, a cursor pages after or before it.
 */
const createServer = () => {
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
      const timer = setTimeout(() => resolve(answer(variables)), LATENCY);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
  return { fetch, sent };
};

/** The panel's pager for one origin: the order's cursors, seek and places. */
const pagerFor = (
  server: ReturnType<typeof createServer>,
  opened: Order,
  seek: OrderSeek | undefined,
  fractions: Map<string, number>,
) => {
  const cursors = createPageCursors();
  return async (key: number, signal: AbortSignal): Promise<Page> => {
    const plan = planPage({
      cursors,
      key,
      order: opened,
      pageSize: PAGE_SIZE,
      seek,
      variables: (page, size) =>
        ({ dataset: "d", ...pageWindow(page, size) }) as never,
    });
    if (!plan) return { items: [], next: null, previous: null };
    const connection = await server.fetch(
      plan.variables as Record<string, unknown>,
      signal,
    );
    const placed = placePage(key, plan, connection, cursors, PAGE_SIZE);
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

const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await env.tick(LATENCY);
    await env.idle();
  }
};

describe.each(["NUMBER", "ID"] as const)(
  "a rail release on an INDEXED order (%s scale)",
  (scale) => {
    test("seeks once, lands the seek page, and warms around it", async () => {
      const opened = order(scale);
      const server = createServer();
      const fractions = new Map<string, number>();
      let source = createPageSource(
        pagerFor(server, opened, undefined, fractions),
      );
      const mounted = mountHost({
        sourceOf: () => source,
        onPage: (key, start, page) => {
          for (const next of warmKeys(key, start, page, opened.mode)) {
            source.warm(next);
          }
        },
      });
      mounted.host.rebuild();
      env.resize(SIZE);
      await settle();
      expect(mounted.current).toBe("i0");
      expect(mounted.looker.tiles("i0")).toContain("s0");

      // a release at the middle, where nothing is loaded, plans one seek
      const mode = gridRailMode(opened, false);
      expect(isRailed(mode) && mode.kind).toBe("value");
      if (!isRailed(mode)) return;
      const plan = mode.jump(
        0.5,
        undefined,
        { fractions, sequences: new Map() },
        PAGE_SIZE,
      );
      expect(plan).toEqual({ seek: { fraction: 0.5 } });

      // the panel keys a new source by the new origin and rebuilds at key 0
      const sought = server.sent.length;
      const old = source;
      source = createPageSource(
        pagerFor(server, opened, { fraction: 0.5 }, fractions),
      );
      old.dispose();
      mounted.host.rebuild({ key: 0 });
      await settle();

      expect(mounted.current).toBe("i1");
      const shown = mounted.looker.tiles("i1");
      expect(shown).toContain(`s${N / 2}`);
      const seekRequest = server.sent[sought];
      expect(seekRequest.variables).toMatchObject({
        count: PAGE_SIZE,
        order: "token",
        seek: { fraction: 0.5 },
      });
      expect(seekRequest.signal.aborted).toBe(false);
      // the page before the seek page is fetched (warmed, then read)
      const before = server.sent
        .slice(sought)
        .find((request) => request.variables.before === String(N / 2));
      expect(before?.signal.aborted).toBe(false);
      expect(shown).toContain(`s${N / 2 - 1}`);
    });
  },
);
