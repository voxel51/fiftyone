import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SETTLE } from "../host/createHost";
import { type Environment, installEnvironment } from "./environment";
import { scroller, scrollTo } from "./mount";
import { mountHost } from "./mountHost";

const SIZE = { width: 1028, height: 600 };
const BURST = [1000, 950, 900, 850];

let env: Environment;

beforeEach(() => {
  env = installEnvironment(SIZE);
});

afterEach(() => {
  env.restore();
  document.body.innerHTML = "";
});

/**
 * A loaded host scrolled into page 1 (50 lookers shown, 5 hidden), with its
 * counts zeroed.
 */
const setup = async (options: Parameters<typeof mountHost>[0] = {}) => {
  const mounted = mountHost(options);
  mounted.host.rebuild();
  // the observer's first report only records the starting extent
  env.resize(SIZE);
  await env.idle();
  await scrollTo(env, scroller(slot(mounted.container)), 1000);

  const held = mounted.renderer.held;
  mounted.renderer.reset();
  mounted.fetches.reset();
  mounted.log.length = 0;
  // assigned, not spread, so `builds` and `current` stay live getters
  return Object.assign(mounted, { held });
};

const slot = (container: HTMLElement) =>
  container.firstElementChild as HTMLElement;

const burst = async () => {
  for (const width of BURST) env.resize({ width, height: 600 });
  await env.idle();
};

const settle = async () => {
  await env.tick(SETTLE);
  await env.idle();
};

const kinds = (violations: { kind: string }[], kind: string) =>
  violations.filter((violation) => violation.kind === kind);

const NONE = { creates: 0, reattaches: 0, resizes: 0, skipped: 0 };

describe("host contracts: cross-axis resize", () => {
  test("a burst builds once as it starts and once when it settles", async () => {
    const mounted = await setup();
    await burst();
    expect(mounted.log).toEqual(["build i1", "load i1", "dispose i0"]);

    await settle();
    expect(mounted.log.slice(3)).toEqual(["build i2", "load i2", "dispose i1"]);
    expect(mounted.builds).toBe(3);
    expect(mounted.current).toBe("i2");
    expect(mounted.container.children).toHaveLength(1);
    expect(mounted.fetches.total).toBe(0);
  });

  test("a burst's retired instance detaches nothing", async () => {
    const { renderer } = await setup();
    await burst();

    expect(renderer.instance("i0").detaches).toBe(0);
    expect(renderer.violations).toEqual([]);
  });

  test("the first content build reattaches every held looker", async () => {
    const { held, looker, renderer, ...mounted } = await setup();
    await burst();
    await settle();

    // 50 held lookers move and resize; the narrower tiles bring in 10
    // items that were never held, so nothing held is created again
    expect(looker.counts("i1")).toEqual({
      creates: 10,
      reattaches: 50,
      resizes: 50,
      skipped: 0,
    });
    expect(looker.tiles("i1").filter((id) => !held.includes(id))).toHaveLength(
      10,
    );
    expect(looker.tiles("i2")).toHaveLength(60);
    expect(looker.blank("i2")).toEqual([]);
    expect(renderer.violations).toEqual([]);
    expect(mounted.fetches.total).toBe(0);
  });

  test("a primary-axis resize does not rebuild", async () => {
    const { log, renderer, ...mounted } = await setup();
    env.resize({ width: 1028, height: 900 });
    await settle();

    expect(log).toEqual([]);
    expect(mounted.builds).toBe(1);
    // the taller window takes back the held row above and three new below
    expect(renderer.shown()).toHaveLength(70);
    expect(renderer.instance("i0")).toMatchObject({
      creates: 15,
      reattaches: 5,
      resizes: 0,
    });
    expect(renderer.violations).toEqual([]);
  });

  test("a horizontal strip rebuilds on height, not width", async () => {
    const mounted = await setup({
      axis: "height",
      config: { horizontal: true, offset: 0, rowAspectRatioThreshold: () => 0 },
    });
    env.resize({ width: 1400, height: 600 });
    await settle();
    expect(mounted.log).toEqual([]);

    env.resize({ width: 1400, height: 500 });
    await env.idle();
    await settle();
    expect(mounted.log).toEqual(["build i1", "load i1", "dispose i0"]);
  });

  test("a rebuild anchored mid-page leaves the cached page whole", async () => {
    const { host, pages, source } = await setup();
    expect(host.anchor?.at?.description).toBe("1-5");
    await burst();
    await settle();

    const page = await source.get(1);
    expect(page.items.map(({ id }) => id.description)).toEqual(pages.ids(1));
  });
});

/** A settings change: a content rebuild while content is on screen. */
describe("host contracts: content rebuild", () => {
  test("swaps at the new load and reuses every looker", async () => {
    const { host, looker, ...mounted } = await setup();
    host.rebuild(host.anchor);
    await env.idle();

    expect(mounted.log).toEqual(["build i1", "load i1", "dispose i0"]);
    expect(looker.counts("i1")).toEqual({ ...NONE, reattaches: 50 });
    expect(looker.blank("i1")).toEqual([]);
    expect(mounted.fetches.total).toBe(0);
  });

  test("without scoping, the old teardown detaches the new one's items", async () => {
    const { host, renderer } = await setup({ scoped: false });
    host.rebuild(host.anchor);
    await env.idle();

    // every one of the 50 lookers the new instance took over
    expect(kinds(renderer.violations, "foreign-detach")).toHaveLength(50);
  });

  // the pending instance defers its shows until the swap hands the lookers over
  test("the visible instance keeps its tiles until the swap", async () => {
    const { atLoad, host, renderer } = await setup();
    host.rebuild(host.anchor);
    await env.idle();

    expect(atLoad.get("i1")?.visibleBlank).toBe(0);
    expect(kinds(renderer.violations, "show-elsewhere")).toEqual([]);
  });

  // the visible instance keeps scrolling until it is retired at the swap
  test("scrolling during the rebuild leaves no blank tiles", async () => {
    const { container, host, looker } = await setup();
    const element = scroller(slot(container));
    host.rebuild(host.anchor);
    element.scrollTop = 1100;
    element.dispatchEvent(new Event("scroll"));
    await env.idle(4);
    await env.tick(300);
    await env.idle();

    expect(looker.blank("i1")).toEqual([]);
  });
});

describe("host contracts: first load", () => {
  test("the first swap leaves every tile its instance shows shown", async () => {
    const mounted = mountHost();
    mounted.host.rebuild();
    env.resize(SIZE);
    await env.idle();

    // checked at the swap: a later render re-shows tiles and would hide a
    // bug that the next cache.empty() turns into grey tiles
    expect(mounted.current).toBe("i0");
    expect(mounted.looker.tiles("i0").length).toBe(30);
    expect(mounted.unshownAtSwap.get("i0")).toEqual([]);
  });
});

describe("host contracts: remount", () => {
  test("pages in memory lay out and reattach their lookers in the first build's call", async () => {
    const first = await setup();
    const label = first.current ?? "";
    const shown = first.looker.tiles(label).sort();
    const anchor = first.host.anchor;
    first.host.destroy();
    first.container.remove();

    const second = mountHost({ remount: first });
    second.host.rebuild(anchor);

    // no frame or microtask has run
    expect(second.current).toBe("i0");
    expect(second.looker.tiles("i0").sort()).toEqual(shown);
    expect(second.looker.counts("i0")).toEqual({
      creates: 0,
      reattaches: shown.length,
      resizes: 0,
      skipped: 0,
    });
    expect(second.looker.blank("i0")).toEqual([]);
    expect(second.fetches.total).toBe(0);
  });

  test("a remount restores the place it saved, not a row off", async () => {
    // the grid's own offset, below the actions row it scrolls under
    const first = await setup({ config: { offset: 48 } });
    const slotOf = (mounted: typeof first) =>
      mounted.container.querySelector(
        '[data-floodlight-slot="active"]',
      ) as HTMLElement;
    // partway into a row, then report where that is
    await scrollTo(env, scroller(slotOf(first)), 1037);
    const anchor = first.host.anchor;
    first.host.destroy();
    first.container.remove();

    const second = mountHost({ remount: first, config: { offset: 48 } });
    second.host.rebuild(anchor);
    const restored = scroller(slotOf(second));
    // report the restored place without moving
    await scrollTo(env, restored, restored.scrollTop);

    expect(second.host.anchor).toEqual(anchor);
  });

  test("clicking a tile does not scroll the grid", async () => {
    const mounted = await setup({ config: { onItemClick: () => undefined } });
    const view = scroller(
      mounted.container.querySelector(
        '[data-floodlight-slot="active"]',
      ) as HTMLElement,
    );
    await scrollTo(env, view, 1037);
    const before = { anchor: mounted.host.anchor, top: view.scrollTop };

    const tiles = view.querySelectorAll('[class*="spotlightRow"] > div');
    (tiles[tiles.length - 1] as HTMLElement).click();
    await env.idle();

    expect(view.scrollTop).toBe(before.top);
    expect(mounted.host.anchor).toEqual(before.anchor);
  });

  test("pages not in memory are fetched asynchronously", async () => {
    const mounted = mountHost();
    mounted.host.rebuild();

    expect(mounted.current).toBeUndefined();
    expect(mounted.looker.tiles("i0")).toEqual([]);

    env.resize(SIZE);
    await env.idle();
    expect(mounted.current).toBe("i0");
    expect(mounted.looker.tiles("i0").length).toBe(30);
  });
});
