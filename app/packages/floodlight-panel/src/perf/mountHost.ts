import { type Anchor, type BuildContext, createHost } from "../host/createHost";
import { createOwnership, type Scoped } from "../host/ownership";
import { createPageSource } from "../host/pageSource";
import { createGridRenderer } from "../Grid/gridRenderer";
import { handOff } from "../Grid/handoff";
import { createCacheRenderer } from "./cacheRenderer";
import { type Counts, createCountingRenderer } from "./countingRenderer";
import { countCalls, createFakePages, type FakeItem } from "./fakePages";
import {
  createContainer,
  createEngine,
  type Engine,
  type EngineOptions,
} from "./mount";

type Data = FakeItem["data"];

/**
 * A real host over real engine instances, wired with the same modules as
 * `Grid.tsx`: `createGridRenderer` per build and `handOff` at each swap, over
 * one page source and one ownership map, counted on the way. `log` records
 * builds, loads and disposals.
 */
export const mountHost = ({
  axis = "width",
  config = {},
  pages = createFakePages({ pages: 10, perPage: 20 }),
  scoped = true,
}: {
  axis?: "width" | "height";
  config?: Partial<EngineOptions>;
  pages?: ReturnType<typeof createFakePages>;
  scoped?: boolean;
} = {}) => {
  const container = createContainer();
  const fetches = countCalls(pages.fetch);
  const source = createPageSource(fetches.fn, {
    ids: (page) => page.items.map((item) => item.id.description),
  });
  const looker = createCacheRenderer<number, Data>();
  const renderer = createCountingRenderer<number, Data>(looker);
  const ownership = createOwnership();
  const labels = new Map<Engine, string>();
  const anchors: (Anchor<number> | undefined)[] = [];
  const log: string[] = [];
  const interims = new Set<string>();
  const shimmers = new Map<string, number>();
  const sizes = new Map<string, [number, number]>();
  const scopes = new Map<Engine, Scoped<number, Data>>();
  // right after each swap: the next instance's tiles the cache calls unshown
  const unshownAtSwap = new Map<string, string[]>();
  // at each load, before the host swaps: what the instance had done, the
  // violation total, and how many tiles of the visible instance were blank
  const atLoad = new Map<
    string,
    { counts: Counts; violations: number; visibleBlank: number }
  >();

  const shimmer = (label: string) => () => {
    shimmers.set(label, (shimmers.get(label) ?? 0) + 1);
    return Promise.resolve(0);
  };

  const build = (
    anchor: Anchor<number> | undefined,
    { interim }: BuildContext,
  ) => {
    const label = `i${labels.size}`;
    interim && interims.add(label);
    const counted = renderer.for(label);
    const grid = createGridRenderer<Data>({
      base: () => counted,
      cached: (key) => Boolean(looker.cache.get(key)),
      deferred: scoped && Boolean(host.instance),
      interim,
      ownership,
      reattach: true,
      shimmer: shimmer(label),
      sizes,
    });
    const { spotlight } = createEngine({
      key: anchor?.key ?? 0,
      at: anchor?.at,
      get: (key) => source.get(key),
      ...(scoped ? grid : counted),
      ...config,
    });
    scoped && scopes.set(spotlight, grid);
    spotlight.addEventListener("load", () => {
      log.push(`load ${label}`);
      atLoad.set(label, {
        counts: { ...renderer.instance(label) },
        violations: renderer.violations.length,
        visibleBlank: host.instance
          ? looker.blank(labels.get(host.instance) ?? "").length
          : 0,
      });
    });
    labels.set(spotlight, label);
    anchors.push(anchor);
    log.push(`build ${label}${interim ? " interim" : ""}`);
    return spotlight;
  };

  const host = createHost<number, Engine>({
    axis,
    build,
    element: container,
    onDispose: (instance) => log.push(`dispose ${labels.get(instance)}`),
    onSwap: (next, previous) => {
      previous && renderer.release(labels.get(previous) ?? "");
      handOff({
        cache: looker.cache,
        evict: source.takeRemoved(),
        next: scopes.get(next),
        previous: previous && scopes.get(previous),
      });
      const label = labels.get(next) ?? "";
      unshownAtSwap.set(
        label,
        looker.tiles(label).filter((id) => !looker.cache.isShown(id)),
      );
    },
  });

  return {
    anchors,
    atLoad,
    container,
    fetches,
    host,
    interims,
    looker,
    shimmers,
    log,
    unshownAtSwap,
    pages,
    renderer,
    source,
    /** The label of the instance on screen. */
    get current() {
      return host.instance && labels.get(host.instance);
    },
    get builds() {
      return labels.size;
    },
  };
};
