/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DEFAULT_OFFSET } from "./constants";
import Spotlight from "./index";

let frames: FrameRequestCallback[] = [];

const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = frames;
    frames = [];
    for (const frame of pending) frame(0);
  }
};

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) =>
    frames.push(frame),
  );
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: 600,
    width: 1028,
  } as DOMRect);
  HTMLElement.prototype.scrollTo = () => {};
});

afterEach(() => {
  frames = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Spotlight", () => {
  test("offsets the sections when the first page leaves the viewport short", async () => {
    // one row per page, so the fill must load more than one page
    const spotlight = new Spotlight<number, object>({
      key: 0,
      get: async (page) => ({
        items: Array.from({ length: 5 }, (_, i) => ({
          id: { description: `${page}-${i}` },
          aspectRatio: 1,
          data: {},
        })),
        next: page < 9 ? page + 1 : null,
        previous: page > 0 ? page - 1 : null,
      }),
      detachItem: () => {},
      hideItem: () => {},
      showItem: async () => 0,
      rowAspectRatioThreshold: () => 5,
    });
    const loaded = vi.fn();
    spotlight.addEventListener("load", loaded);

    const host = document.createElement("div");
    document.body.append(host);
    spotlight.attach(host);
    await settle();

    const sections = [...host.firstElementChild.children] as HTMLElement[];
    expect(loaded).toHaveBeenCalledOnce();
    expect(sections.map((section) => section.style.top)).toEqual([
      `${DEFAULT_OFFSET}px`,
      `${DEFAULT_OFFSET}px`,
    ]);

    spotlight.destroy();
    host.remove();
  });

  test("leaves the pages it is given unchanged", async () => {
    const page = {
      items: Array.from({ length: 5 }, (_, i) => ({
        id: { description: `0-${i}` },
        aspectRatio: 1,
        data: {},
      })),
      next: null,
      previous: null,
    };
    const items = page.items;
    // anchoring mid-page makes the engine split the page it starts from
    const spotlight = new Spotlight<number, object>({
      at: { description: "0-2" },
      key: 0,
      get: async () => page,
      detachItem: () => {},
      hideItem: () => {},
      showItem: async () => 0,
      rowAspectRatioThreshold: () => 5,
    });

    const host = document.createElement("div");
    document.body.append(host);
    spotlight.attach(host);
    await settle();

    expect(page.items).toBe(items);
    expect(page.items.map((item) => item.id.description)).toEqual([
      "0-0",
      "0-1",
      "0-2",
      "0-3",
      "0-4",
    ]);

    spotlight.destroy();
    host.remove();
  });

  describe("peek", () => {
    const pageOf = (page: number) => ({
      items: Array.from({ length: 5 }, (_, i) => ({
        id: { description: `${page}-${i}` },
        aspectRatio: 1,
        data: {},
        key: page,
      })),
      next: page < 9 ? page + 1 : null,
      previous: page > 0 ? page - 1 : null,
    });

    const mount = (peek: (page: number) => ReturnType<typeof pageOf>) => {
      const get = vi.fn(async (page: number) => pageOf(page));
      const shown = vi.fn(async () => 0);
      const spotlight = new Spotlight<number, object>({
        key: 2,
        get,
        peek,
        detachItem: () => {},
        hideItem: () => {},
        showItem: shown,
        rowAspectRatioThreshold: () => 5,
      });
      const loaded = vi.fn();
      spotlight.addEventListener("load", loaded);
      const host = document.createElement("div");
      document.body.append(host);
      spotlight.attach(host);
      return { get, host, loaded, shown, spotlight };
    };

    test("lays out pages in memory within attach", () => {
      const { get, host, loaded, shown, spotlight } = mount(pageOf);

      // no frame or microtask has run
      expect(get).not.toHaveBeenCalled();
      expect(shown).toHaveBeenCalled();
      expect(loaded).toHaveBeenCalledOnce();

      spotlight.destroy();
      host.remove();
    });

    test("fetches a page not in memory asynchronously", async () => {
      const { get, host, loaded, shown, spotlight } = mount(() => undefined);

      expect(get).toHaveBeenCalledWith(2);
      expect(shown).not.toHaveBeenCalled();
      expect(loaded).not.toHaveBeenCalled();

      await settle();
      expect(shown).toHaveBeenCalled();
      expect(loaded).toHaveBeenCalledOnce();

      spotlight.destroy();
      host.remove();
    });

    test("continues asynchronously from the first page not in memory", async () => {
      const { get, host, loaded, shown, spotlight } = mount((page) =>
        page === 2 ? pageOf(page) : undefined,
      );

      expect(get).toHaveBeenCalledWith(3);
      expect(loaded).not.toHaveBeenCalled();

      await settle();
      expect(shown).toHaveBeenCalled();
      expect(loaded).toHaveBeenCalledOnce();

      spotlight.destroy();
      host.remove();
    });
  });
});
