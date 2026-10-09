import type { At, RowChange } from "@fiftyone/floodlight";

/** What the host needs from a Floodlight instance. */
export interface Instance extends EventTarget {
  attach(element: HTMLElement): void;
  destroy(): void;
}

/** Where an instance starts: its first page and the item at the top. */
export interface Anchor<K> {
  key: K;
  at?: At;
}

/** The extent whose change means a new instance (width for a vertical grid). */
export type CrossAxis = "width" | "height";

export type HostStatus = "building" | "ready";

export interface BuildContext {
  /** Built during a resize: skip item content. */
  interim: boolean;
  /** Replaces a large instance unseen: lay out from pages in memory. */
  quiet: boolean;
}

export interface HostOptions<K, I extends Instance> {
  /** Positioned container; each instance renders in its own slot inside it. */
  element: HTMLElement;
  build: (anchor: Anchor<K> | undefined, context: BuildContext) => I;
  axis: CrossAxis;
  anchor?: Anchor<K>;
  onAnchor?: (anchor: Anchor<K>) => void;
  onDispose?: (instance: I) => void;
  onStatus?: (status: HostStatus, instance: I) => void;
  /** Runs at a swap, before the previous instance is disposed. */
  onSwap?: (next: I, previous: I | undefined) => void;
  /** Runs before each rebuild a resize causes, whose swap may animate. */
  onResize?: () => void;
  /**
   * Whether an instance holds too much (e.g. pages read). Once scrolling
   * stops on such an instance, a quiet rebuild at its anchor replaces it, so
   * no instance grows with how far it was scrolled.
   */
  outgrown?: (instance: I) => boolean;
  /** Whether something else (an animation) owns the instances right now. */
  busy?: () => boolean;
}

/** Milliseconds after the last resize tick before the content build. */
export const SETTLE = 150;
/**
 * Milliseconds a laid-out instance waits for `validated` (its item sizes
 * within budget) before it is revealed anyway, e.g. when media fails to load.
 */
export const VALIDATE_TIMEOUT = 5000;
export const SLOT = "data-floodlight-slot";

type Entry<I> = {
  instance: I;
  slot: HTMLElement;
  quiet: boolean;
  /** The panel extent it was built at */
  extent?: number;
  timeout?: ReturnType<typeof setTimeout>;
};

/**
 * Keeps one short-lived instance on screen. A rebuild renders the next
 * instance in a hidden slot and reveals it at its `validated`, or
 * {@link VALIDATE_TIMEOUT} after its `load`; a `rejected` instance is
 * disposed unrevealed, for a rebuild at a smaller size to replace. During a
 * cross-axis resize each tick builds an interim instance (at most one in
 * flight), and the resize settling builds the content instance. An
 * outgrown instance is rebuilt at its anchor once scrolling stops.
 */
export const createHost = <K, I extends Instance>(
  options: HostOptions<K, I>,
) => {
  const { axis, build, element } = options;
  let anchor = options.anchor;
  let current: Entry<I> | undefined;
  let pending: Entry<I> | undefined;
  let extent: number | undefined;
  // resized before anything loaded: nothing to move, so rebuild once after it loads
  let resizedEarly = false;
  let resizing: ReturnType<typeof setTimeout> | undefined;
  let continued = false;
  let destroyed = false;
  let frame: number | undefined;

  const dispose = (entry: Entry<I>) => {
    clearTimeout(entry.timeout);
    options.onDispose?.(entry.instance);
    entry.instance.destroy();
    entry.slot.remove();
  };

  // while a drag holds the grid, it stays centered in the panel rather than
  // riding the edge that moves
  const center = (entry: Entry<I>) => {
    const shift = ((extent ?? 0) - (entry.extent ?? extent ?? 0)) / 2;
    entry.slot.style.transform = shift
      ? axis === "width"
        ? `translateX(${shift}px)`
        : `translateY(${shift}px)`
      : "";
  };

  const track = (event: Event) => {
    const { at, fraction, page } = event as RowChange<K>;
    anchor = { key: page, at: { description: at.description, fraction } };
    options.onAnchor?.(anchor);
  };

  const rebuild = (
    start: Anchor<K> | undefined = anchor,
    interim = false,
    quiet = false,
  ) => {
    if (destroyed) return;
    pending && dispose(pending);
    anchor = start;

    const slot = document.createElement("div");
    slot.style.position = "absolute";
    slot.style.inset = "0";
    slot.setAttribute(SLOT, "pending");
    slot.style.visibility = "hidden";
    element.appendChild(slot);

    const entry: Entry<I> = {
      instance: build(start, { interim, quiet }),
      slot,
      quiet,
      extent,
    };
    pending = entry;
    const reveal = () => {
      if (pending !== entry) return;
      clearTimeout(entry.timeout);
      pending = undefined;
      options.onSwap?.(entry.instance, current?.instance);
      current && dispose(current);
      current = entry;
      slot.style.visibility = "";
      resizing !== undefined && center(entry);
      slot.setAttribute(SLOT, "active");
      entry.instance.addEventListener("rowchange", track);
      options.onStatus?.("ready", entry.instance);
      if (resizedEarly) {
        resizedEarly = false;
        rebuild();
      }
    };
    entry.instance.addEventListener(
      "load",
      () => {
        if (pending === entry) {
          entry.timeout = setTimeout(reveal, VALIDATE_TIMEOUT);
        }
      },
      { once: true },
    );
    entry.instance.addEventListener("validated", reveal, { once: true });
    entry.instance.addEventListener("rejected", () => {
      if (pending !== entry) return;
      pending = undefined;
      dispose(entry);
    });
    options.onStatus?.("building", entry.instance);
    entry.instance.attach(slot);
  };

  const observer = new ResizeObserver(([entry]) => {
    const next =
      axis === "width" ? entry.contentRect.width : entry.contentRect.height;
    if (!next) return;
    const changed = extent !== undefined && next !== extent;
    extent = next;
    if (!changed) return;
    if (!current) {
      resizedEarly = Boolean(pending);
      return;
    }

    // a single change (a sidebar toggling) rebuilds at once; a run of
    // changes (a drag) holds the grid still and rebuilds once it settles
    const continuing = resizing !== undefined;
    clearTimeout(resizing);
    resizing = setTimeout(() => {
      resizing = undefined;
      if (!continued) return;
      continued = false;
      options.onResize?.();
      rebuild();
    }, SETTLE);
    if (continuing) {
      continued = true;
      center(current);
      return;
    }
    options.onResize?.();
    rebuild(anchor);
  });
  observer.observe(element);

  const compact = () => {
    frame = undefined;
    const { busy, outgrown } = options;
    if (destroyed || pending || resizing !== undefined || !current) return;
    if (!outgrown?.(current.instance) || busy?.()) return;
    rebuild(anchor, false, true);
  };
  const onScrollEnd = () => {
    frame !== undefined && cancelAnimationFrame(frame);
    // the engine reports its final row in the frame after scrollend
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(compact);
    });
  };
  // a quiet build still fetching would land at a stale anchor: scrolling
  // the visible instance abandons it
  const onScroll = (event: Event) => {
    if (!pending?.quiet || !current?.slot.contains(event.target as Node)) {
      return;
    }
    dispose(pending);
    pending = undefined;
  };
  if (options.outgrown) {
    element.addEventListener("scrollend", onScrollEnd, true);
    element.addEventListener("scroll", onScroll, true);
  }

  return {
    get anchor() {
      return anchor;
    },
    get instance() {
      return current?.instance;
    },
    rebuild: (start?: Anchor<K>) => rebuild(start ?? anchor),
    /** Starts over from the top, dropping what is shown */
    reset: () => {
      if (destroyed) return;
      pending && dispose(pending);
      current && dispose(current);
      pending = current = undefined;
      anchor = undefined;
      rebuild();
    },
    destroy: () => {
      destroyed = true;
      clearTimeout(resizing);
      frame !== undefined && cancelAnimationFrame(frame);
      element.removeEventListener("scrollend", onScrollEnd, true);
      element.removeEventListener("scroll", onScroll, true);
      observer.disconnect();
      pending && dispose(pending);
      current && dispose(current);
      pending = current = undefined;
    },
  };
};

export type Host<K, I extends Instance> = ReturnType<typeof createHost<K, I>>;
