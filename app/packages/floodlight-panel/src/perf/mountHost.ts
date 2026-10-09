import type { Response } from "@fiftyone/floodlight";
import { type Anchor, type BuildContext, createHost } from "../host/createHost";
import { createOwnership, type Scoped } from "../host/ownership";
import {
  createPageSource,
  type Lease,
  type PageSource,
} from "../host/pageSource";
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
type Page = Response<number, Data>;

interface Remount {
  fetches: ReturnType<typeof countCalls<number, Page>>;
  looker: ReturnType<typeof createCacheRenderer<number, Data>>;
  source: PageSource<number, Page>;
}

/**
 * A real host over real engine instances, wired with the same modules as
 * `Grid.tsx`: `createGridRenderer` per build and `handOff` at each swap, over
 * one page source and one ownership map, counted on the way. `log` records
 * builds, loads and disposals. `remount` passes an earlier mount's pages and
 * lookers, as the panel's memory does when the grid mounts again.
 */
export const mountHost = ({
  axis = "width",
  capacity,
  config = {},
  limit,
  pages = createFakePages({ pages: 10, perPage: 20 }),
  remount,
  scoped = true,
}: {
  axis?: "width" | "height";
  /** Pages the source keeps beyond the live instances'. */
  capacity?: number;
  config?: Partial<EngineOptions>;
  /** Pages an instance reads before a quiet rebuild replaces it. */
  limit?: number;
  pages?: ReturnType<typeof createFakePages>;
  remount?: Remount;
  scoped?: boolean;
} = {}) => {
  const container = createContainer();
  const fetches = remount?.fetches ?? countCalls(pages.fetch);
  const source =
    remount?.source ??
    createPageSource(fetches.fn, {
      capacity,
      ids: (page) => page.items.map((item) => item.id.description),
    });
  const looker = remount?.looker ?? createCacheRenderer<number, Data>();
  const renderer = createCountingRenderer<number, Data>(looker);
  const ownership = createOwnership();
  const labels = new Map<Engine, string>();
  const anchors: (Anchor<number> | undefined)[] = [];
  const log: string[] = [];
  const interims = new Set<string>();
  const shimmers = new Map<string, number>();
  const sizes = new Map<string, [number, number]>();
  const scopes = new Map<Engine, Scoped<number, Data>>();
  const leases = new Map<Engine, Lease<number, Page>>();
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
    { interim, quiet }: BuildContext,
  ) => {
    const lease = source.lease(
      quiet && host.instance ? leases.get(host.instance) : undefined,
    );
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
      get: (key) => lease.get(key),
      peek: host.instance && !quiet ? undefined : (key) => lease.peek(key),
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
    leases.set(spotlight, lease);
    anchors.push(anchor);
    log.push(
      `build ${label}${interim ? " interim" : ""}${quiet ? " quiet" : ""}`,
    );
    return spotlight;
  };

  const host = createHost<number, Engine>({
    axis,
    build,
    element: container,
    onDispose: (instance) => {
      leases.get(instance)?.release();
      leases.delete(instance);
      log.push(`dispose ${labels.get(instance)}`);
    },
    outgrown:
      limit === undefined
        ? undefined
        : (instance) => (leases.get(instance)?.size ?? 0) > limit,
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
    leases,
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
