/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SCROLLBAR_WIDTH, SLOW_DOWN } from "./constants";
import Spotlight from "./index";
import type { Response } from "./types";

const VIEWPORT_HEIGHT = 600;
const VIEWPORT_WIDTH = 1000 + SCROLLBAR_WIDTH * 2;
/** Square items at this threshold tile ten to a row, about 100px tall */
const ROW_ASPECT_RATIO = 10;
const ITEM_BYTES = 10;

interface DeferredPage<V> {
  key: number;
  resolve: (response: Response<number, V>) => void;
}

interface Harness<V> {
  /** pages requested through config.get, in request order */
  requested: DeferredPage<V>[];
  /** ids passed to config.showItem, in call order */
  shown: string[];
  /** "load" and "render" events, in dispatch order */
  events: string[];
  /** resolve the pending request for `key` with its generated page */
  resolve: (key: number) => Promise<void>;
  /** resolve every request, including ones made while resolving, in order */
  resolveAll: () => Promise<void>;
  /** end a user scroll on the spotlight and let its render settle */
  scroll: () => Promise<void>;
  /** run queued animation frames and let promises settle */
  settle: () => Promise<void>;
  spotlight: Spotlight<number, V>;
}

let frames: FrameRequestCallback[] = [];
let rejections: unknown[] = [];
const recordRejection = (reason: unknown) => rejections.push(reason);

beforeEach(() => {
  frames = [];
  rejections = [];
  process.on("unhandledRejection", recordRejection);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
  Element.prototype.scrollTo = () => undefined;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    height: VIEWPORT_HEIGHT,
    width: VIEWPORT_WIDTH,
  } as DOMRect);
});

afterEach(() => {
  process.off("unhandledRejection", recordRejection);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const flushFrames = () => {
  const current = frames;
  frames = [];
  for (const frame of current) frame(performance.now());
};

export const createHarness = <V>(options: {
  itemsPerPage: number;
  totalItems: number;
  maxItemsSizeBytes?: number;
  at?: { description: string; offset?: number };
  key?: number;
}): Harness<V> => {
  const requested: DeferredPage<V>[] = [];
  const shown: string[] = [];
  const events: string[] = [];
  const { itemsPerPage, totalItems } = options;
  const lastKey = Math.max(Math.ceil(totalItems / itemsPerPage) - 1, 0);

  const pageFor = (key: number): Response<number, V> => {
    const start = key * itemsPerPage;
    const end = Math.min(start + itemsPerPage, totalItems);
    const items = [];
    for (let i = start; i < end; i++) {
      items.push({
        aspectRatio: 1,
        data: null as V,
        id: { description: String(i) },
        key,
      });
    }

    return {
      items,
      next: key < lastKey ? key + 1 : null,
      previous: key > 0 ? key - 1 : null,
    };
  };

  const spotlight = new Spotlight<number, V>({
    at: options.at,
    key: options.key ?? 0,
    maxItemsSizeBytes: options.maxItemsSizeBytes,
    detachItem: () => undefined,
    get: (key) =>
      new Promise((resolve) => {
        requested.push({ key, resolve });
      }),
    hideItem: () => undefined,
    rowAspectRatioThreshold: () => ROW_ASPECT_RATIO,
    showItem: async ({ id }) => {
      shown.push(id.description);
      return ITEM_BYTES;
    },
  });
  spotlight.addEventListener("render", () => events.push("render"));
  spotlight.addEventListener("load", () => events.push("load"));

  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      flushFrames();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  const resolve = async (key: number) => {
    const page = requested.find((request) => request.key === key);
    if (!page) throw new Error(`page ${key} was not requested`);
    page.resolve(pageFor(key));
    await settle();
  };

  const resolveAll = async () => {
    for (let i = 0; i < requested.length; i++) {
      requested[i].resolve(pageFor(requested[i].key));
      await settle();
    }
  };

  const element = document.createElement("div");
  document.body.appendChild(element);
  spotlight.attach(element);

  const scroll = async () => {
    element.firstElementChild.dispatchEvent(new Event("scrollend"));
    await settle();
  };

  return {
    events,
    requested,
    resolve,
    resolveAll,
    scroll,
    settle,
    shown,
    spotlight,
  };
};

const keys = (harness: Harness<unknown>) =>
  harness.requested.map(({ key }) => key);

describe("Spotlight fill", () => {
  test("first showItem happens after page 0 resolves, before page 1", async () => {
    const harness = createHarness({ itemsPerPage: 20, totalItems: 200 });
    await harness.settle();
    expect(keys(harness)).toEqual([0]);
    expect(harness.shown).toEqual([]);

    await harness.resolve(0);

    expect(harness.shown.length).toBeGreaterThan(0);
    expect(harness.shown[0]).toBe("0");
    expect(keys(harness)).toEqual([0, 1]);
  });

  test("render fires once, after the first paint and before load", async () => {
    const harness = createHarness({ itemsPerPage: 20, totalItems: 200 });
    await harness.settle();
    await harness.resolve(0);
    expect(harness.events).toEqual(["render"]);

    await harness.resolveAll();
    expect(harness.events).toEqual(["render", "load"]);
  });

  test("fill continues until the forward section reaches the viewport", async () => {
    const harness = createHarness({ itemsPerPage: 20, totalItems: 400 });
    await harness.settle();
    await harness.resolve(0);
    await harness.resolve(1);
    await harness.resolve(2);
    expect(harness.events).toEqual(["render"]);

    // Each page adds about two 100px rows, the rest held back as
    // remainder, so the fourth page fills the 600px viewport
    await harness.resolve(3);
    expect(harness.events).toEqual(["render", "load"]);
    expect(harness.spotlight.loaded).toBe(true);
  });

  test("load fires exactly once without maxItemsSizeBytes", async () => {
    const harness = createHarness({ itemsPerPage: 20, totalItems: 400 });
    await harness.settle();
    await harness.resolveAll();
    await harness.settle();

    expect(harness.events.filter((e) => e === "load")).toHaveLength(1);
  });

  test("load fires exactly once with maxItemsSizeBytes", async () => {
    const harness = createHarness({
      itemsPerPage: 20,
      totalItems: 400,
      maxItemsSizeBytes: 1e9,
    });
    await harness.settle();
    await harness.resolve(0);
    expect(harness.events).toEqual(["render"]);

    await harness.resolveAll();
    await harness.settle();

    expect(harness.events).toEqual(["render", "load"]);
    expect(harness.spotlight.loaded).toBe(true);
  });

  test("a scroll during fill does not load with maxItemsSizeBytes", async () => {
    const harness = createHarness({
      itemsPerPage: 20,
      totalItems: 400,
      maxItemsSizeBytes: 1e9,
    });
    await harness.settle();
    await harness.resolve(0);
    await harness.scroll();

    expect(harness.events).toEqual(["render"]);
    expect(harness.spotlight.loaded).toBe(false);

    await harness.resolveAll();
    await harness.settle();

    expect(harness.events).toEqual(["render", "load"]);
  });

  test("restoring `at` in the middle paints at that item", async () => {
    const harness = createHarness({
      at: { description: "45", offset: 0 },
      itemsPerPage: 20,
      key: 2,
      totalItems: 200,
    });
    await harness.settle();
    await harness.resolve(2);

    // The page before `at` is loaded before the first paint
    expect(keys(harness)).toEqual([2, 1]);
    expect(harness.shown).toEqual([]);

    await harness.resolve(1);

    expect(harness.events).toEqual(["render"]);
    expect(harness.shown).toContain("45");
    expect(harness.shown).not.toContain("0");
  });

  test("an empty first page loads", async () => {
    const harness = createHarness({ itemsPerPage: 20, totalItems: 0 });
    await harness.settle();
    await harness.resolve(0);

    expect(keys(harness)).toEqual([0]);
    expect(harness.shown).toEqual([]);
    expect(harness.events).toEqual(["render", "load"]);
  });

  test("a dataset shorter than the viewport loads", async () => {
    const harness = createHarness({ itemsPerPage: 20, totalItems: 30 });
    await harness.settle();
    await harness.resolve(0);
    await harness.resolve(1);

    expect(keys(harness)).toEqual([0, 1]);
    expect(new Set(harness.shown).size).toBe(30);
    expect(harness.events).toEqual(["render", "load"]);
  });

  test("no SLOW_DOWN rejection while filling", async () => {
    const harness = createHarness({ itemsPerPage: 20, totalItems: 400 });
    await harness.settle();
    await harness.resolveAll();
    await harness.settle();

    expect(rejections).toEqual([]);
    expect(rejections).not.toContain(SLOW_DOWN);
    // Each page is requested once
    expect(new Set(keys(harness)).size).toBe(harness.requested.length);
  });
});
