import type * as foq from "@fiftyone/relay";
import { describe, expect, it } from "vitest";
import type { Order } from "../order/order";
import { createPageCursors, rememberCursors } from "./pageCursors";
import { createCursorStore, placePage, planPage } from "./orderedPages";

const variables = (page: number, pageSize: number) =>
  ({
    dataset: "d",
    view: [],
    filter: {},
    after: page ? String(page * pageSize - 1) : null,
  }) as unknown as ReturnType<Parameters<typeof planPage>[0]["variables"]>;

const order = (mode: Order["mode"]): Order => ({
  kind: "order",
  token: "token",
  mode,
  total: mode === "SMALL" ? 100 : null,
  bounds: null,
  desc: false,
  ticks: [],
});

const plan = (
  mode: Order["mode"] | "unordered",
  key: number,
  seek?: { fraction: number },
  cursors = createPageCursors(),
) =>
  planPage({
    cursors,
    key,
    order: mode === "unordered" ? { kind: "unordered" } : order(mode),
    pageSize: 20,
    seek,
    variables,
  });

const connection = (
  edges: { offset?: number; fraction?: number }[],
  info: Partial<foq.PaginateSamplesConnection["pageInfo"]> = {},
) =>
  ({
    edges: edges.map((edge, i) => ({ cursor: `c${i}`, node: {}, ...edge })),
    pageInfo: {
      hasNextPage: true,
      hasPreviousPage: true,
      startCursor: "first",
      endCursor: "last",
      ...info,
    },
  }) as unknown as foq.PaginateSamplesConnection;

describe("planPage", () => {
  it("pages an order by its token and cursors, never by skip", () => {
    const cursors = createPageCursors();
    rememberCursors(cursors, 0, { startCursor: "s0", endCursor: "e0" });
    expect(
      plan("INDEXED", 1, { fraction: 0.5 }, cursors)?.variables,
    ).toMatchObject({ order: "token", after: "e0", before: null, seek: null });
  });

  it("sends a SCROLL order no seek for any key", () => {
    const cursors = createPageCursors();
    rememberCursors(cursors, 0, { startCursor: "s0", endCursor: "e0" });
    for (const key of [0, 1]) {
      expect(
        plan("SCROLL", key, { fraction: 0.5 }, cursors)?.variables.seek,
      ).toBeNull();
    }
    expect(plan("SCROLL", -1, { fraction: 0.5 }, cursors)).toBeUndefined();
    expect(plan("SCROLL", 4, undefined, cursors)).toBeUndefined();
  });

  it("addresses a SMALL key by offset", () => {
    expect(plan("SMALL", 3)?.variables.seek).toEqual({ offset: 60 });
  });

  it("pages a view the server cannot order by skip, forward only", () => {
    expect(plan("unordered", 2)?.variables).toMatchObject({ after: "39" });
    expect(plan("unordered", 2)?.variables).not.toHaveProperty("order");
    expect(plan("unordered", -1)).toBeUndefined();
  });
});

describe("placePage", () => {
  it("places a SMALL page by its offsets and fractions", () => {
    const planned = plan("SMALL", 3)!;
    const cursors = createPageCursors();
    const placed = placePage(
      3,
      planned,
      connection([{ offset: 60, fraction: 0.6 }]),
      cursors,
      20,
    );
    expect(placed.place(0)).toEqual({ sequence: 60, fraction: 0.6 });
    expect([placed.previous, placed.next]).toEqual([2, 4]);
    expect(cursors.ends.get(3)).toBe("last");
  });

  it("places a backward page so it ends where the next page starts", () => {
    const cursors = createPageCursors();
    rememberCursors(cursors, 0, { startCursor: "s0", endCursor: "e0" });
    const planned = plan("INDEXED", -1, { fraction: 0.5 }, cursors)!;
    const placed = placePage(
      -1,
      planned,
      connection([{ fraction: 0.1 }, { fraction: 0.2 }], {
        hasPreviousPage: false,
      }),
      cursors,
      20,
    );
    expect([placed.place(0).sequence, placed.place(1).sequence]).toEqual([
      -2, -1,
    ]);
    expect([placed.previous, placed.next]).toEqual([null, 0]);
  });
});

describe("createCursorStore", () => {
  it("keeps cursors per order and origin, a bounded number of them", () => {
    const cursorsFor = createCursorStore();
    const first = cursorsFor("a", 0);
    expect(cursorsFor("a", 0)).toBe(first);
    expect(cursorsFor("a", 1)).not.toBe(first);
    for (let origin = 2; origin < 8; origin++) cursorsFor("a", origin);
    expect(cursorsFor("a", 0)).not.toBe(first);
  });
});
