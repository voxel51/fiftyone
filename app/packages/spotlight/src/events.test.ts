/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import Spotlight, { Load } from "./index";
import Row from "./row";
import type { ItemData, SpotlightConfig } from "./types";

const ITEM: ItemData<number, null> = {
  aspectRatio: 1,
  data: null,
  id: { description: "a" },
  key: 0,
};

const config = (
  overrides: Partial<SpotlightConfig<number, null>> = {},
): SpotlightConfig<number, null> => ({
  key: 0,
  detachItem: vi.fn(),
  get: async () => ({ items: [ITEM], next: null, previous: null }),
  hideItem: vi.fn(),
  rowAspectRatioThreshold: () => 1,
  showItem: async () => 0,
  ...overrides,
});

describe("Spotlight events", () => {
  let host: HTMLElement;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 400,
      width: 400,
    } as DOMRect);
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) =>
      setTimeout(run, 0),
    );
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("sends load to its listeners, as an object or a function", async () => {
    const spotlight = new Spotlight(config());
    const loaded = new Promise<Load<number>>((resolve) =>
      spotlight.addEventListener("load", resolve),
    );
    const handleEvent = vi.fn();
    spotlight.addEventListener("load", { handleEvent });

    spotlight.attach(host);
    const load = await loaded;

    expect(load).toBeInstanceOf(Load);
    expect(load.type).toBe("load");
    expect(load.page).toBe(0);
    expect(handleEvent).toHaveBeenCalledExactlyOnceWith(load);
    spotlight.destroy();
  });

  test("a removed listener, or one on a destroyed spotlight, hears nothing", async () => {
    const first = new Spotlight(config());
    const removed = vi.fn();
    first.addEventListener("load", removed);
    first.removeEventListener("load", removed);
    const loaded = new Promise((resolve) =>
      first.addEventListener("load", resolve),
    );
    first.attach(host);
    await loaded;
    expect(removed).not.toHaveBeenCalled();
    first.destroy();

    const second = new Spotlight(config());
    const late = vi.fn();
    second.destroy();
    second.addEventListener("load", late);
    expect(late).not.toHaveBeenCalled();
  });
});

describe("Row open", () => {
  test("hands showItem an open that runs the click path without an event", async () => {
    const onItemClick = vi.fn();
    const showItem = vi.fn(async () => 0);
    const focus = vi.fn();
    const iter = { next: vi.fn() };
    const row = new Row({
      config: { ...config({ onItemClick, showItem }), spacing: 0 },
      dangle: false,
      focus,
      from: 0,
      items: [ITEM],
      iter: iter as never,
      width: 100,
    });

    row.show({
      attr: "top",
      element: document.createElement("div"),
      spotlight: {} as never,
      zooming: false,
    });
    const [{ element, open }] = showItem.mock.calls[0] as unknown as [
      { element: HTMLElement; open: () => void },
    ];

    open();
    expect(focus).toHaveBeenCalledWith(ITEM.id);
    expect(onItemClick).toHaveBeenLastCalledWith({
      event: undefined,
      item: ITEM,
      iter,
    });

    element.click();
    expect(onItemClick).toHaveBeenCalledTimes(2);
    expect(onItemClick.mock.calls[1][0].event).toBeInstanceOf(MouseEvent);
  });

  test("offers no open without onItemClick", () => {
    const showItem = vi.fn(async () => 0);
    const row = new Row({
      config: { ...config({ showItem }), spacing: 0 },
      dangle: false,
      focus: vi.fn(),
      from: 0,
      items: [ITEM],
      iter: {} as never,
      width: 100,
    });

    row.show({
      attr: "top",
      element: document.createElement("div"),
      spotlight: {} as never,
      zooming: false,
    });

    expect(showItem.mock.calls[0][0]).toHaveProperty("open", undefined);
  });
});
