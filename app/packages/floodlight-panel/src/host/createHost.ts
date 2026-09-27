import type { At, RowChange } from "@fiftyone/floodlight";
import { createSettle } from "./settle";

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

export interface HostOptions<K, I extends Instance> {
  /** Positioned container; each instance renders in its own slot inside it. */
  element: HTMLElement;
  build: (anchor: Anchor<K> | undefined) => I;
  axis: CrossAxis;
  /** Milliseconds after the last cross-axis change before rebuilding. */
  settle?: number;
  anchor?: Anchor<K>;
  onAnchor?: (anchor: Anchor<K>) => void;
  onDispose?: (instance: I) => void;
  onStatus?: (status: HostStatus, instance: I) => void;
}

export const SETTLE = 150;
export const SLOT = "data-floodlight-slot";

type Entry<I> = { instance: I; slot: HTMLElement };

/**
 * Keeps one short-lived instance on screen. A rebuild renders the next
 * instance in a hidden slot and swaps it in at its `load`, so the old one
 * stays visible until the new one has tiles to show.
 */
export const createHost = <K, I extends Instance>(
  options: HostOptions<K, I>,
) => {
  const { axis, build, element } = options;
  let anchor = options.anchor;
  let current: Entry<I> | undefined;
  let pending: Entry<I> | undefined;
  let extent: number | undefined;
  let destroyed = false;

  const dispose = (entry: Entry<I>) => {
    options.onDispose?.(entry.instance);
    entry.instance.destroy();
    entry.slot.remove();
  };

  const track = (event: Event) => {
    const { at, fraction, page } = event as RowChange<K>;
    anchor = { key: page, at: { description: at.description, fraction } };
    options.onAnchor?.(anchor);
  };

  const rebuild = (start: Anchor<K> | undefined = anchor) => {
    if (destroyed) return;
    pending && dispose(pending);
    anchor = start;

    const slot = document.createElement("div");
    slot.style.position = "absolute";
    slot.style.inset = "0";
    slot.setAttribute(SLOT, current ? "pending" : "active");
    if (current) slot.style.visibility = "hidden";
    element.appendChild(slot);

    const entry = { instance: build(start), slot };
    pending = entry;
    entry.instance.addEventListener(
      "load",
      () => {
        if (pending !== entry) return;
        pending = undefined;
        current && dispose(current);
        current = entry;
        slot.style.visibility = "";
        slot.setAttribute(SLOT, "active");
        entry.instance.addEventListener("rowchange", track);
        options.onStatus?.("ready", entry.instance);
      },
      { once: true },
    );
    options.onStatus?.("building", entry.instance);
    entry.instance.attach(slot);
  };

  const settle = createSettle(() => rebuild(), options.settle ?? SETTLE);
  const observer = new ResizeObserver(([entry]) => {
    const next =
      axis === "width" ? entry.contentRect.width : entry.contentRect.height;
    if (!next) return;
    if (extent !== undefined && next !== extent) settle.trigger();
    extent = next;
  });
  observer.observe(element);

  return {
    get anchor() {
      return anchor;
    },
    get instance() {
      return current?.instance;
    },
    rebuild,
    destroy: () => {
      destroyed = true;
      settle.cancel();
      observer.disconnect();
      pending && dispose(pending);
      current && dispose(current);
      pending = current = undefined;
    },
  };
};

export type Host<K, I extends Instance> = ReturnType<typeof createHost<K, I>>;
