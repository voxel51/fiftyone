/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { ParamDef } from "./param";
import type { LocationStore } from "./store";

/**
 * One key of session state, all three legs: how it arrives from the server,
 * how it goes back, and whether it lives in the URL. A key with only
 * `location` is a param and needs no declaration here.
 *
 * The legs are the host's own code, so they close over whatever else they
 * need — its transport, its storage, its loading indicator. The store is all
 * this package has to hand them.
 *
 * Named for `Session` in @fiftyone/state, which is what the setter, writer and
 * event registries are already keyed on.
 */
export interface SessionKeyDef<T, R = unknown> {
  key: string;
  fromServer?: (store: LocationStore<R>, payload: unknown) => void;
  toServer?: (store: LocationStore<R>, value: T) => void;
  location?: ParamDef<T>;
}

const KEYS = new Map<string, SessionKeyDef<unknown>>();

export const defineSessionKey = <T, R = unknown>(
  def: SessionKeyDef<T, R>,
): SessionKeyDef<T, R> => {
  const existing = KEYS.get(def.key);
  if (existing && existing !== (def as unknown as SessionKeyDef<unknown>)) {
    throw new Error(`session key "${def.key}" is already defined`);
  }
  KEYS.set(def.key, def as unknown as SessionKeyDef<unknown>);
  return def;
};

export const sessionKeys = (): SessionKeyDef<unknown>[] => [...KEYS.values()];
