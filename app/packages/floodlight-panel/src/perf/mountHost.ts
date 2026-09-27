import { type Anchor, type BuildContext, createHost } from "../host/createHost";
import { createOwnership, scopeRenderer } from "../host/ownership";
import { createPageSource } from "../host/pageSource";
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
 * A real host over real engine instances, wired like `Grid.tsx`: one page
 * source and one ownership map. Interim builds render shimmer only; content
 * builds freeze the looker cache and render through the scoped grid
 * renderer, counted on the way. `log` records builds, loads and disposals.
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
  const source = createPageSource(fetches.fn);
  const looker = createCacheRenderer<number, Data>();
  const renderer = createCountingRenderer<number, Data>(looker);
  const ownership = createOwnership();
  const labels = new Map<Engine, string>();
  const anchors: (Anchor<number> | undefined)[] = [];
  const log: string[] = [];
  const interims = new Set<string>();
  const shimmers = new Map<string, number>();
  // at each load, before the host swaps: what the instance had done, the
  // violation total, and how many tiles of the visible instance were blank
  const atLoad = new Map<
    string,
    { counts: Counts; violations: number; visibleBlank: number }
  >();

  const shimmer = (label: string) => ({
    detachItem: () => undefined,
    hideItem: () => undefined,
    showItem: () => {
      shimmers.set(label, (shimmers.get(label) ?? 0) + 1);
      return Promise.resolve(0);
    },
  });

  const build = (
    anchor: Anchor<number> | undefined,
    { interim }: BuildContext,
  ) => {
    const label = `i${labels.size}`;
    interim ? interims.add(label) : looker.cache.freeze();
    const counted = renderer.for(label);
    const content = scoped ? scopeRenderer(counted, ownership) : counted;
    const { spotlight } = createEngine({
      key: anchor?.key ?? 0,
      at: anchor?.at,
      get: (key) => source.get(key),
      ...(interim ? shimmer(label) : content),
      ...config,
    });
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
