import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type Environment, installEnvironment } from "./environment";
import { createFakePages } from "./fakePages";
import { scroller, scrollTo } from "./mount";
import { mountHost } from "./mountHost";

// five squares a row, four rows (about 800px) a page
const SIZE = { width: 1028, height: 600 };
const CAPACITY = 8;
const LIMIT = 12;

let env: Environment;

beforeEach(() => {
  env = installEnvironment(SIZE);
});

afterEach(() => {
  env.restore();
  document.body.innerHTML = "";
});

const active = (container: HTMLElement) =>
  container.querySelector('[data-floodlight-slot="active"]') as HTMLElement;

const setup = async (pages = 300) => {
  const mounted = mountHost({
    capacity: CAPACITY,
    limit: LIMIT,
    pages: createFakePages({ pages, perPage: 20 }),
  });
  mounted.host.rebuild();
  env.resize(SIZE);
  await env.idle();
  return mounted;
};

/** Scrolls the instance on screen down by `by` pixels and lets it stop. */
const scrollBy = async (container: HTMLElement, by: number) => {
  const element = scroller(active(container));
  await scrollTo(env, element, element.scrollTop + by);
};

describe("memory contracts: a long scroll", () => {
  test("rebuilds outgrown instances quietly and keeps every structure bounded", async () => {
    const mounted = await setup();
    const { container, fetches, host, leases, log, looker, source } = mounted;
    let quiet = 0;

    for (let step = 0; step < 120; step++) {
      const before = log.length;
      await scrollBy(container, 1000);

      const built = log.slice(before).filter((line) => line.endsWith("quiet"));
      quiet += built.length;
      // the source holds its capacity plus what the live instances read
      expect(leases.size).toBeLessThanOrEqual(2);
      const held = [...leases.values()].reduce((sum, l) => sum + l.size, 0);
      expect(held).toBeLessThanOrEqual(LIMIT + 4);
      expect(source.size).toBeLessThanOrEqual(CAPACITY + held);
      expect(container.children).toHaveLength(1);
      expect(looker.blank(mounted.current ?? "")).toEqual([]);
      expect(host.anchor?.key).toBeGreaterThan(0);
    }

    expect(quiet).toBeGreaterThan(5);
    // forward only: no page in memory was fetched again
    expect([...fetches.calls.values()].every((count) => count === 1)).toBe(
      true,
    );
    expect(host.anchor?.key).toBeGreaterThan(140);
  });

  test("a quiet rebuild lands at the same anchor with its lookers, fetching nothing", async () => {
    const pages = createFakePages({ pages: 300, perPage: 20 });
    const log: string[] = [];
    const mounted = mountHost({
      capacity: CAPACITY,
      limit: LIMIT,
      pages: {
        ...pages,
        fetch: (key: number) => {
          log.push(`fetch ${key}`);
          return pages.fetch(key);
        },
      },
    });
    mounted.host.rebuild();
    env.resize(SIZE);
    await env.idle();
    const { container, host, looker } = mounted;

    let shown: string[] = [];
    let label = "";
    while (!mounted.log.some((line) => line.endsWith("quiet"))) {
      label = mounted.current ?? "";
      shown = looker.tiles(label);
      const from = mounted.log.length;
      await scrollBy(container, 1000);
      for (const line of mounted.log.slice(from)) log.push(line);
    }

    const built = log.findIndex((line) => line.endsWith("quiet"));
    const next = log[built].split(" ")[1];
    // laid out from memory: loaded and swapped in before any fetch
    expect(log.slice(built, built + 3)).toEqual([
      `build ${next} quiet`,
      `load ${next}`,
      `dispose ${label}`,
    ]);
    const anchor = mounted.anchors[mounted.anchors.length - 1];
    expect(host.anchor?.key).toBe(anchor?.key);
    expect(host.anchor?.at?.description).toBe(anchor?.at?.description);
    expect(host.anchor?.at?.fraction).toBeCloseTo(anchor?.at?.fraction ?? -1);
    expect(mounted.atLoad.get(next)?.visibleBlank).toBe(0);
    expect(looker.blank(next)).toEqual([]);
    // the lookers on screen moved over instead of being created again
    expect(looker.tiles(next).filter((id) => shown.includes(id))).not.toEqual(
      [],
    );
    expect(looker.counts(next)).toMatchObject({ creates: 0, resizes: 0 });
  });

  test("a jump disposes the building instance and aborts what only it waited on", async () => {
    const signals: AbortSignal[] = [];
    const pages = createFakePages({ pages: 1000, perPage: 20 });
    const slow = {
      ...pages,
      fetch: (key: number, signal?: AbortSignal) => {
        signal && signals.push(signal);
        // the first window answers; jumps never do
        return key < 4 ? pages.fetch(key) : new Promise<never>(() => undefined);
      },
    };
    const mounted = mountHost({ capacity: CAPACITY, pages: slow });
    mounted.host.rebuild();
    env.resize(SIZE);
    await env.idle();

    let most = 0;
    for (const key of [100, 300, 50, 700, 20, 900]) {
      mounted.host.rebuild({ key });
      await env.idle(2);
      most = Math.max(most, mounted.source.active);
    }

    expect(most).toBeLessThanOrEqual(4);
    // every jump but the last was superseded: its fetches were aborted
    const live = signals.filter((signal) => !signal.aborted);
    expect(live.length).toBeLessThanOrEqual(4);
    expect(mounted.fetches.calls.get(900)).toBe(1);
    for (const key of [100, 300, 50, 700, 20]) {
      expect(mounted.source.peek(key)).toBeUndefined();
    }
    expect(mounted.container.children).toHaveLength(2);
  });
});
