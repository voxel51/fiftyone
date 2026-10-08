/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Atom, WritableAtom } from "jotai";
import type { REVERB } from "./named";
import type { AtomEffect } from "./effects";
import type { Loadable as LoadableInterface } from "./loadable";
import type { DefaultValue } from "./sentinel";

/** What a write accepts: a value, a reset, or an updater over the current value. */
export type Write<T> = T | DefaultValue | ((previous: T) => T | DefaultValue);

export type ReverbValue<T> = Atom<T>;

/** What `named()` stamps on state: a key, and a mark a plain object lacks. */
export interface Branded {
  key: string;
  [REVERB]: true;
}

export type ReverbValueReadOnly<T> = Atom<T> & Branded;

export type ReverbState<T> = WritableAtom<T, [Write<T>], void> & Branded;

export type SetterOrUpdater<T> = (next: Write<T>) => void;

export type GetReverbValue = <T>(state: ReverbValue<T>) => T;

export type SetReverbState = <T>(state: ReverbState<T>, next: Write<T>) => void;

export type ResetReverbState = <T>(state: ReverbState<T>) => void;

export interface TransactionInterface {
  get: GetReverbValue;
  set: SetReverbState;
  reset: ResetReverbState;
}

export interface CallbackInterface extends TransactionInterface {
  snapshot: SnapshotInterface;
}

export interface SnapshotInterface {
  getLoadable: <T>(state: ReverbValue<T>) => LoadableInterface<T>;
  getPromise: <T>(state: ReverbValue<T>) => Promise<T>;
}

export interface MutableSnapshot {
  set: SetReverbState;
  reset: ResetReverbState;
}

export interface AtomOptions<T> {
  key: string;
  /** Another piece of state reads through to it, and keeps tracking it. */
  default: T | ReverbValueReadOnly<T>;
  /**
   * Computes the value on read until a write lands. An effect cannot set a
   * value before the first read returns, so state fed by one needs this.
   */
  resolve?: () => T;
  effects?: AtomEffect<T>[];
  /** Accepted and ignored; nothing here freezes a value. */
  dangerouslyAllowMutability?: boolean;
}

export interface ReadOnlySelectorOptions<T> {
  key: string;
  get: (accessors: { get: GetReverbValue }) => T;
}

export interface ReadWriteSelectorOptions<
  T,
> extends ReadOnlySelectorOptions<T> {
  set: (accessors: TransactionInterface, newValue: T | DefaultValue) => void;
}

export interface AtomFamilyOptions<T, P> {
  key: string;
  default: T | ((param: P) => T);
  effects?: AtomEffect<T>[] | ((param: P) => AtomEffect<T>[]);
  dangerouslyAllowMutability?: boolean;
}

export interface ReadOnlySelectorFamilyOptions<T, P> {
  key: string;
  get: (param: P) => (accessors: { get: GetReverbValue }) => T;
}

export interface ReadWriteSelectorFamilyOptions<
  T,
  P,
> extends ReadOnlySelectorFamilyOptions<T, P> {
  set: (
    param: P,
  ) => (accessors: TransactionInterface, newValue: T | DefaultValue) => void;
}

/** A family parameter must serialize, because members are keyed by value. */
export type SerializableParam =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly SerializableParam[]
  | { readonly [key: string]: SerializableParam };
