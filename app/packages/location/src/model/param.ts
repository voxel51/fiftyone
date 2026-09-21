/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { HistoryPolicy } from "./types";

export interface ParamDef<T> {
  key: string;
  /** Called with `undefined` when the key is absent, so it must have a default. */
  parse: (raw: string | undefined) => T;
  /** Returning `undefined` omits the key rather than writing an empty value. */
  format: (value: T) => string | undefined;
  history: HistoryPolicy;
  /**
   * Which of the host's scopes this param belongs to, by the same name the
   * host's `RouteCodec.scopes` uses. The param clears when that scope's token
   * changes; this package never interprets the name.
   */
  scope: string;
}

const PARAMS = new Map<string, ParamDef<unknown>>();

/**
 * Registers a URL parameter and returns its definition. Registration exists
 * for scope clearing and to reject two features claiming one key.
 */
export const defineParam = <T>(def: ParamDef<T>): ParamDef<T> => {
  const existing = PARAMS.get(def.key);
  if (existing && existing !== (def as ParamDef<unknown>)) {
    throw new Error(`location param "${def.key}" is already defined`);
  }
  PARAMS.set(def.key, def as ParamDef<unknown>);
  return def;
};

export const paramsInScope = (scope: string): ParamDef<unknown>[] =>
  [...PARAMS.values()].filter((def) => def.scope === scope);
