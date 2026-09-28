import Spotlight, { type Response, RowChange } from "@fiftyone/floodlight";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createBoundedSource } from "../Grid/Pages/boundedSource";
import { keyRange } from "../Grid/Pages/model";
import { createPageSource, type PageSource } from "../host/pageSource";
import { type Environment, installEnvironment } from "./environment";
import type { createFakePages, FakeItem } from "./fakePages";
import { mountHost } from "./mountHost";

/**
 * Data changes under a live grid: samples deleted and aspect ratios changed
 * after pages were fetched. The fake server pages by `$skip` over its rows at
 * fetch time, like `paginateSamples` without an order.
 */

const SIZE = { width: 1028, height: 600 };
const PER_PAGE = 20;

type Data = FakeItem["data"];
type Page = Response<number, Data>;

const createServer = (count: number) => {
  let rows = Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    aspectRatio: 1,
  }));
  const hooks: ((page: number) => void)[] = [];

  const fetch = async (page: number): Promise<Page> => {
    hooks.forEach((hook) => hook(page));
    const start = page * PER_PAGE;
    return {
      items: rows.slice(start, start + PER_PAGE).map((row, index) => ({
        aspectRatio: row.aspectRatio,
        data: { page, index },
        id: { description: row.id },
        key: page,
      })),
      next: start + PER_PAGE < rows.length ? page + 1 : null,
      previous: page > 0 ? page - 1 : null,
    };
  };

  return {
    fetch,
    /** Runs `hook` before each fetch reads the rows. */
    beforeFetch: (hook: (page: number) => void) => hooks.push(hook),
    delete: (...ids: string[]) => {
      rows = rows.filter((row) => !ids.includes(row.id));
    },
    setAspectRatio: (id: string, aspectRatio: number) => {
      rows = rows.map((row) => (row.id === id ? { ...row, aspectRatio } : row));
    },
    ids: () => rows.map((row) => row.id),
    /** In the shape `mountHost` takes; it only calls `fetch`. */
    get pages() {
      return { fetch } as unknown as ReturnType<typeof createFakePages>;
    },
  };
};

const ids = (page: Page) => page.items.map((item) => item.id.description);

const duplicates = (list: string[]) =>
  list.filter((id, i) => list.indexOf(id) !== i);

/**
 * The invalidation the design adds to `PageSource`: drops cached pages whose
 * key passes `keys` (all when omitted), so the next `get` refetches them.
 * Absent today, so these calls are no-ops and the cached pages stay.
 */
const invalidate = <K, P>(
  source: PageSource<K, P>,
  keys?: (key: K) => boolean,
) =>
  (
    source as PageSource<K, P> & {
      invalidate?: (keys?: (key: K) => boolean) => void;
    }
  ).invalidate?.(keys);

describe("skip paging under deletion: page source", () => {
  test.fails(
    "a page fetched after a deletion on an earlier page skips a sample (skip offsets shift by one)",
    async () => {
      const server = createServer(200);
      const source = createPageSource(server.fetch);
      const first = await source.get(0);
      server.delete("s5");
      const second = await source.get(1);

      const shown = [...ids(first), ...ids(second)].filter((id) => id !== "s5");
      // every survivor through the end of page 1, once: s20 is on neither page
      expect(shown).toEqual(server.ids().slice(0, 39));
    },
  );

  test.fails(
    "a page fetched backward after a deletion repeats the sample at the boundary",
    async () => {
      const server = createServer(200);
      const source = createPageSource(server.fetch);
      const five = await source.get(5);
      const six = await source.get(6);
      server.delete("s3");
      const four = await source.get(4);

      const shown = [...ids(four), ...ids(five), ...ids(six)];
      expect(duplicates(shown)).toEqual([]);
    },
  );

  test.fails(
    "Pages mode: a UI page built after a deletion on an earlier UI page starts one sample late",
    async () => {
      const server = createServer(200);
      const source = createPageSource(server.fetch);
      let range = keyRange(0, 40, PER_PAGE);
      const bounded = createBoundedSource(source, () => range);
      const uiPage1 = [
        ...ids(await bounded.get(0)),
        ...ids(await bounded.get(1)),
      ];
      server.delete("s0");
      range = keyRange(1, 40, PER_PAGE);
      const uiPage2 = [
        ...ids(await bounded.get(2)),
        ...ids(await bounded.get(3)),
      ];

      // s40 is the last sample of UI page 1 now, and the first of neither
      expect(uiPage1.at(-1)).toBe("s39");
      expect(uiPage2[0]).toBe("s40");
    },
  );
});

let env: Environment;

beforeEach(() => {
  env = installEnvironment(SIZE);
});

afterEach(() => {
  vi.restoreAllMocks();
  env.restore();
  document.body.innerHTML = "";
});

type Mounted = ReturnType<typeof mountHost>;

const start = async (
  server: ReturnType<typeof createServer>,
  anchor?: Parameters<Mounted["host"]["rebuild"]>[0],
) => {
  // each instance reports its top row as it renders; the host saves the latest
  const tops = new Map<EventTarget, { at: string; fraction: number }>();
  const dispatch = Spotlight.prototype.dispatchEvent;
  vi.spyOn(Spotlight.prototype, "dispatchEvent").mockImplementation(function (
    this: EventTarget,
    event: Event,
  ) {
    event instanceof RowChange &&
      tops.set(this, {
        at: event.at.description,
        fraction: event.fraction,
      });
    return dispatch.call(this, event);
  });
  const mounted = mountHost({ pages: server.pages });
  mounted.host.rebuild(anchor);
  // the observer's first report only records the starting extent
  env.resize(SIZE);
  await env.idle();
  return Object.assign(mounted, {
    /** The top row's first item and how far the view is into that row. */
    top: () => mounted.host.instance && tops.get(mounted.host.instance),
  });
};

describe("skip paging under deletion: host and engine", () => {
  // the engine splits the anchor's page at the anchor, so it heads its row
  test("control: with no deletion, an anchor on s27 heads the top row", async () => {
    const mounted = await start(createServer(200), {
      key: 1,
      at: { description: "s27", fraction: 0 },
    });

    expect(mounted.top()).toEqual({ at: "s27", fraction: 0 });
  });

  test.fails(
    "a sample repeated across a page boundary leaves one of its tiles blank",
    async () => {
      const server = createServer(200);
      // the backward fill fetches page 4 after page 5: delete in between
      server.beforeFetch((page) => page === 4 && server.delete("s3"));
      const mounted = await start(server, { key: 5 });

      expect(mounted.current).toBe("i0");
      expect(mounted.looker.blank("i0")).toEqual([]);
    },
  );

  test.fails(
    "an anchor on a deleted sample starts the new instance at its surviving neighbor",
    async () => {
      const server = createServer(200);
      server.delete("s27");
      const mounted = await start(server, {
        key: 1,
        at: { description: "s27", fraction: 0 },
      });

      // page 1 is now s20..s26, s28..s40: s28 takes s27's place. The engine
      // finds no `at`, never scrolls (the view shows page 0 from s0) and
      // reports { at: "s25", fraction: 1 }
      expect(mounted.top()).toEqual({ at: "s28", fraction: 0 });
    },
  );

  test.fails(
    "a bulk deletion before the anchor moves it off the pages it is rebuilt from",
    async () => {
      const server = createServer(200);
      server.delete(...Array.from({ length: 25 }, (_, i) => `s${i}`));
      // saved before the deletion: s40 heads page 2; it is now rank 15, page
      // 0, and neither page 2 nor page 1 holds it
      const mounted = await start(server, {
        key: 2,
        at: { description: "s40", fraction: 0 },
      });

      expect(mounted.top()).toEqual({ at: "s40", fraction: 0 });
    },
  );
});

describe("known data changes: rebuild through the host (proposed invalidation)", () => {
  test.fails(
    "a rebuild after a known deletion still shows the deleted sample (pages are cached for the host's lifetime)",
    async () => {
      const server = createServer(200);
      const mounted = await start(server);
      expect(mounted.looker.tiles("i0")).toContain("s3");

      server.delete("s3");
      invalidate(mounted.source, (key) => key >= 0);
      mounted.host.rebuild({ key: 0 });
      await env.idle();

      expect(mounted.current).toBe("i1");
      expect(mounted.looker.tiles("i1")).not.toContain("s3");
      // survivors keep their lookers; only the deleted one leaves the cache
      expect(mounted.looker.counts("i1").creates).toBe(1);
      expect(mounted.looker.cache.get("s3")).toBeUndefined();
    },
  );

  test.fails(
    "a rebuild after a known aspect-ratio change keeps tiling the item at its fetch-time ratio",
    async () => {
      const server = createServer(200);
      const mounted = await start(server);
      const [width, height] = mounted.looker.cache.get("s2")?.dimensions ?? [];
      expect(width).toBe(height);

      server.setAspectRatio("s2", 2);
      invalidate(mounted.source, (key) => key === 0);
      mounted.host.rebuild({ key: 0 });
      await env.idle();

      const [w, h] = mounted.looker.cache.get("s2")?.dimensions ?? [];
      expect(Math.round((w / h) * 100) / 100).toBe(2);
      // the looker is reattached at the new size, not created again
      expect(mounted.looker.counts("i1").creates).toBe(0);
      expect(mounted.fetches.calls.get(0)).toBe(2);
    },
  );
});
