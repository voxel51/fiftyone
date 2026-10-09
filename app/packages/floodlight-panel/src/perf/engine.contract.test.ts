import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createCountingRenderer } from "./countingRenderer";
import { type Environment, installEnvironment } from "./environment";
import { countCalls, createFakePages, type FakeItem } from "./fakePages";
import {
  createContainer,
  createEngine,
  type EngineOptions,
  scroller,
  scrollTo,
} from "./mount";
import { createMutationCounter } from "./mutations";

// 1000px of tiles across, five squares a row: rows are 197.6px plus 3px
// spacing, and the render window is the 600px viewport plus 600px each side.
const SIZE = { width: 1028, height: 600 };
const STEPS = [800, 1600, 2400, 3200, 4000];

let env: Environment;

beforeEach(() => {
  env = installEnvironment(SIZE);
});

afterEach(() => {
  env.restore();
  document.body.innerHTML = "";
});

const setup = (config: Partial<EngineOptions> = {}) => {
  const pages = createFakePages({ pages: 10, perPage: 20 });
  const get = countCalls(pages.fetch);
  const renderer = createCountingRenderer<number, FakeItem["data"]>();
  const container = createContainer();
  const mutations = createMutationCounter(container);
  const engine = createEngine({ get: get.fn, ...renderer.for("a"), ...config });
  engine.spotlight.attach(container);
  return { ...engine, container, get, mutations, pages, renderer };
};

const counts = (calls: Map<number, number>) => Object.fromEntries(calls);

const roundTrip = async (container: HTMLElement) => {
  const element = scroller(container);
  for (const position of STEPS) await scrollTo(env, element, position);
  for (const position of [...STEPS].reverse().slice(1)) {
    await scrollTo(env, element, position);
  }
  await scrollTo(env, element, 0);
};

describe("engine contracts", () => {
  test("initial load creates each item in the first window once", async () => {
    const { events, get, mutations, pages, renderer } = setup();
    await env.idle();

    expect(events.load).toBe(1);
    expect(counts(get.calls)).toEqual({ 0: 1, 1: 1 });
    // six rows start inside the window: all of page 0 and two rows of page 1
    expect(renderer.shown()).toEqual([
      ...pages.ids(0),
      ...pages.ids(1).slice(0, 10),
    ]);
    expect(renderer.totals()).toEqual({
      creates: 30,
      reattaches: 0,
      refreshes: 20,
      resizes: 0,
      hides: 0,
      idleHides: 0,
      detaches: 0,
      strayDetaches: 0,
    });
    expect(renderer.violations).toEqual([]);
    // the scroll element, two sections and six rows
    expect(mutations.take()).toEqual({ added: 9, removed: 0 });
  });

  test("scrolling away and back reattaches instead of re-creating", async () => {
    const { container, get, mutations, pages, renderer } = setup();
    await env.idle();
    const first = renderer.shown();
    mutations.reset();
    const element = scroller(container);

    for (const position of STEPS) await scrollTo(env, element, position);
    expect(renderer.shown()).toHaveLength(50);
    expect(renderer.totals()).toMatchObject({
      creates: 130,
      reattaches: 0,
      hides: 80,
    });

    for (const position of [...STEPS].reverse().slice(1)) {
      await scrollTo(env, element, position);
    }
    await scrollTo(env, element, 0);

    expect(renderer.shown()).toEqual(first);
    expect(renderer.totals()).toMatchObject({
      creates: 130,
      reattaches: 80,
      hides: 180,
      resizes: 0,
    });
    // every item ever shown was created exactly once
    expect(renderer.seen).toHaveLength(130);
    expect(
      renderer.seen.filter((id) => renderer.counts(id).creates !== 1),
    ).toEqual([]);
    expect(counts(get.calls)).toEqual(
      Object.fromEntries(pages.items.slice(0, 7).map((_, page) => [page, 1])),
    );
    expect(renderer.violations).toEqual([]);
    // each row that left the window unmounted once and remounted once
    expect(mutations.take()).toEqual({ added: 36, removed: 36 });
  });

  test("destroy detaches every held item exactly once", async () => {
    const { container, renderer, spotlight } = setup();
    await env.idle();
    await roundTrip(container);
    const held = renderer.held;

    spotlight.destroy();

    expect(held).toHaveLength(130);
    expect(held.filter((id) => renderer.counts(id).detaches !== 1)).toEqual([]);
    expect(renderer.held).toEqual([]);
    // the last two rows of page 6 were tiled but never entered the window
    expect(renderer.totals()).toMatchObject({
      detaches: 130,
      strayDetaches: 10,
    });
    expect(renderer.violations).toEqual([]);
  });

  test("section swaps keep creates and detaches balanced", async () => {
    // eight rows a section, so a round trip swaps and destroys sections
    const { container, renderer, spotlight } = setup({ maxRows: 16 });
    await env.idle();
    await roundTrip(container);
    spotlight.destroy();

    expect(renderer.seen).toHaveLength(170);
    expect(renderer.totals()).toMatchObject({ creates: 275, detaches: 275 });
    expect(
      renderer.seen.filter(
        (id) => renderer.counts(id).creates !== renderer.counts(id).detaches,
      ),
    ).toEqual([]);
    expect(renderer.held).toEqual([]);
    expect(renderer.violations).toEqual([]);
  });

  // With four rows a section, the fill's section swap leaves the forward
  // section empty, so the fill loop walks the whole dataset.
  test.fails(
    "initial fill fetches each page once when a section is shorter than the viewport",
    async () => {
      const { get, renderer } = setup({ maxRows: 8 });
      await env.idle();

      expect(new Set(get.calls.values())).toEqual(new Set([1]));
      expect(renderer.totals().creates).toBe(renderer.shown().length);
    },
  );

  test("destroy disconnects the engine's ResizeObserver", async () => {
    const { spotlight } = setup();
    await env.idle();
    spotlight.destroy();

    expect(env.liveObservers).toBe(0);
  });
});
