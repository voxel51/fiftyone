/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Adapter } from "./adapter";
import type { ParamDef } from "./param";
import { paramsInScope } from "./param";
import type { RouteCodec } from "./route";
import type { HistoryPolicy, LocationModel } from "./types";
import { formatUrl, parseUrl } from "./url";

export interface LocationStore<R> {
  get(): LocationModel<R>;
  subscribe(listener: () => void): () => void;
  /**
   * Advances on every location change, including a pop. Capture it *after*
   * writing, then have any in-flight work discard its result once `isCurrent`
   * is false, so navigating again mid-request drops the answer instead of
   * racing it.
   */
  generation(): number;
  isCurrent(generation: number): boolean;
  /** Reads a registered param. Stable across calls while the URL is unchanged. */
  read<T>(def: ParamDef<T>): T;
  /** Writes a registered param, honoring its history policy. */
  write<T>(def: ParamDef<T>, value: T): void;
  push(next: LocationModel<R>): void;
  replace(next: LocationModel<R>): void;
  update(
    mutate: (current: LocationModel<R>) => LocationModel<R>,
    history: HistoryPolicy,
  ): void;
}

export const createLocationStore = <R>(
  adapter: Adapter,
  codec: RouteCodec<R>,
): LocationStore<R> => {
  // `useSyncExternalStore` compares snapshots by identity, so both the model
  // and each parsed param have to be cached until the href actually changes.
  let href: string | undefined;
  let model: LocationModel<R> | undefined;
  let reads = new Map<string, unknown>();

  // Counted from the adapter's notifications rather than from `commit`, so a
  // pop advances it too — the browser has already moved, and an in-flight
  // request for where we were is just as stale as a superseded click.
  // Subscribed first, so this runs before any React subscriber re-renders.
  let generation = 0;
  adapter.subscribe(() => {
    generation += 1;
  });

  const get = (): LocationModel<R> => {
    const next = adapter.get();
    if (next !== href || !model) {
      href = next;
      model = parseUrl(codec, next);
      reads = new Map();
    }
    return model;
  };

  /** Drops params whose scope's subject the move leaves behind. */
  const clearStale = (
    from: LocationModel<R>,
    to: LocationModel<R>,
  ): LocationModel<R> => {
    const before = codec.scopes(from.route);
    const after = codec.scopes(to.route);
    const stale = new Set<string>();
    for (const scope of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (before[scope] === after[scope]) continue;
      for (const def of paramsInScope(scope)) stale.add(def.key);
    }
    if (!stale.size) return to;

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(to.params)) {
      if (!stale.has(key)) params[key] = value;
    }
    return { ...to, params };
  };

  const commit = (next: LocationModel<R>, history: HistoryPolicy) => {
    const current = get();
    const target = formatUrl(codec, clearStale(current, next));
    if (target === formatUrl(codec, current)) return;
    if (history === "push") {
      adapter.push(target);
    } else {
      adapter.replace(target);
    }
  };

  const update = (
    mutate: (current: LocationModel<R>) => LocationModel<R>,
    history: HistoryPolicy,
  ) => commit(mutate(get()), history);

  return {
    get,
    subscribe: adapter.subscribe,
    generation: () => generation,
    isCurrent: (value) => value === generation,

    read<T>(def: ParamDef<T>): T {
      const current = get();
      if (!reads.has(def.key)) {
        reads.set(def.key, def.parse(current.params[def.key]));
      }
      return reads.get(def.key) as T;
    },

    write<T>(def: ParamDef<T>, value: T) {
      const raw = def.format(value);
      update((current) => {
        const params = { ...current.params };
        if (raw === undefined) {
          delete params[def.key];
        } else {
          params[def.key] = raw;
        }
        return { ...current, params };
      }, def.history);
    },

    push: (next) => commit(next, "push"),
    replace: (next) => commit(next, "replace"),
    update,
  };
};
