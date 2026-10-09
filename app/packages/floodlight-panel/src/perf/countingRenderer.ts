import type { Renderer } from "../host/ownership";

export type ViolationKind =
  /** A show while another element still displays the item. */
  | "show-elsewhere"
  /** A hide from an instance that no longer displays the item. */
  | "foreign-hide"
  /** A detach from an instance that no longer displays the item. */
  | "foreign-detach";

export interface Violation {
  kind: ViolationKind;
  id: string;
  /** The instance label that made the call. */
  by: string;
  /** The instance label that held the item at the time. */
  holder: string;
}

export interface Counts {
  /** Shows that built a looker because none was held. */
  creates: number;
  /** Shows that moved a held looker into an element. */
  reattaches: number;
  /** Repeat shows into the element already displaying the item. */
  refreshes: number;
  /** Shows at dimensions other than the looker's last ones. */
  resizes: number;
  hides: number;
  /** Hides of an item that was not displayed. */
  idleHides: number;
  detaches: number;
  /** Detaches of an item with no looker, e.g. one tiled but never shown. */
  strayDetaches: number;
}

type Looker = {
  dimensions: [number, number];
  element: HTMLElement;
  holder: string;
  shown: boolean;
};

const zero = (): Counts => ({
  creates: 0,
  reattaches: 0,
  refreshes: 0,
  resizes: 0,
  hides: 0,
  idleHides: 0,
  detaches: 0,
  strayDetaches: 0,
});

/**
 * Stands in for the looker cache: one looker per item, displayed in at most
 * one element. Each instance renders through `for(label)` so calls can be
 * attributed to the instance that made them. Calls are forwarded to
 * `downstream`, when given, after they are counted.
 */
export const createCountingRenderer = <K, V>(downstream?: {
  for: (label: string) => Renderer<K, V>;
}) => {
  const lookers = new Map<string, Looker>();
  const counts = new Map<string, Counts>();
  const instances = new Map<string, Counts>();
  const violations: Violation[] = [];

  const entry = (map: Map<string, Counts>, key: string) => {
    let value = map.get(key);
    if (!value) {
      value = zero();
      map.set(key, value);
    }
    return value;
  };

  const forInstance = (label: string): Renderer<K, V> => {
    const next = downstream?.for(label);
    const bump = (id: string, field: keyof Counts) => {
      entry(counts, id)[field]++;
      entry(instances, label)[field]++;
    };
    const flag = (kind: ViolationKind, id: string, holder: string) =>
      violations.push({ kind, id, by: label, holder });

    const count = ({
      id: { description: id },
      element,
      dimensions,
    }: Parameters<Renderer<K, V>["showItem"]>[0]) => {
      const looker = lookers.get(id);
      if (!looker) {
        bump(id, "creates");
        lookers.set(id, { dimensions, element, shown: true, holder: label });
        return;
      }
      const [width, height] = looker.dimensions;
      if (width !== dimensions[0] || height !== dimensions[1]) {
        bump(id, "resizes");
      }
      if (looker.shown && looker.element === element) {
        bump(id, "refreshes");
      } else {
        looker.shown && flag("show-elsewhere", id, looker.holder);
        bump(id, "reattaches");
      }
      Object.assign(looker, {
        dimensions,
        element,
        shown: true,
        holder: label,
      });
    };

    return {
      showItem: (args) => {
        count(args);
        return next?.showItem(args) ?? Promise.resolve(0);
      },
      hideItem: (args) => {
        const id = args.id.description;
        const looker = lookers.get(id);
        if (!looker?.shown) {
          bump(id, "idleHides");
        } else {
          looker.holder !== label && flag("foreign-hide", id, looker.holder);
          bump(id, "hides");
          looker.shown = false;
        }
        next?.hideItem(args);
      },
      detachItem: (item) => {
        const id = item.description;
        const looker = lookers.get(id);
        if (!looker) {
          bump(id, "strayDetaches");
        } else {
          looker.holder !== label && flag("foreign-detach", id, looker.holder);
          bump(id, "detaches");
          lookers.delete(id);
        }
        next?.detachItem(item);
      },
    };
  };

  const totals = (ids: Iterable<string> = counts.keys()) => {
    const sum = zero();
    for (const id of ids) {
      const count = counts.get(id);
      if (!count) continue;
      for (const key of Object.keys(sum) as (keyof Counts)[]) {
        sum[key] += count[key];
      }
    }
    return sum;
  };

  return {
    for: forInstance,
    /** A retired instance gives up what it showed, so taking it over is a transfer. */
    release: (label: string) => {
      for (const looker of lookers.values()) {
        if (looker.holder === label) looker.shown = false;
      }
    },
    counts: (id: string) => counts.get(id) ?? zero(),
    /** Counts of the calls one instance made. */
    instance: (label: string) => instances.get(label) ?? zero(),
    totals,
    violations,
    /** Items that have been shown at least once. */
    get seen() {
      return [...counts.entries()]
        .filter(([, count]) => count.creates)
        .map(([id]) => id);
    },
    /** Items with a live looker. */
    get held() {
      return [...lookers.keys()];
    },
    /** Items currently displayed, optionally only by one instance. */
    shown: (label?: string) =>
      [...lookers.entries()]
        .filter(([, l]) => l.shown && (!label || l.holder === label))
        .map(([id]) => id),
    /** Zeroes the counts and violations; lookers stay held. */
    reset: () => {
      counts.clear();
      instances.clear();
      violations.length = 0;
    },
  };
};

export type CountingRenderer<K, V> = ReturnType<
  typeof createCountingRenderer<K, V>
>;
