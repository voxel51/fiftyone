/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type {
  AtomFamilyOptions,
  AtomOptions,
  ReadWriteSelectorFamilyOptions,
  ReadWriteSelectorOptions,
  ReverbValue,
  SerializableParam,
} from "../index";

export * from "../index";

/** State stands in as its key alone, so a test addresses it without a store. */
type Stub = { key: string; params?: unknown };

export let mockValues = {};
export const mockValuesStore = {};
export let mockDefaults = {};
export function setMockAtoms(newMockValues: { [key: string]: unknown }) {
  mockValues = {
    ...mockValues,
    ...newMockValues,
  };
  mockDefaults = { ...mockDefaults, ...newMockValues };
}

export const getValue = (atom) => {
  // ``waitForAll`` resolves its dependencies eagerly here (the double has no
  // async/loadable machinery): map ``getValue`` over the deps, preserving the
  // array/object shape the caller passed.
  if (atom && atom.__waitForAll) {
    const { deps } = atom;
    return Array.isArray(deps)
      ? deps.map(getValue)
      : Object.fromEntries(
          Object.entries(deps).map(([k, v]) => [k, getValue(v)]),
        );
  }

  if (mockValuesStore[atom.key]) {
    const str = JSON.stringify(atom.params);
    if (Object.hasOwn(mockValuesStore[atom.key], str)) {
      return mockValuesStore[atom.key][str];
    }
  }

  if (atom.params !== undefined) {
    return mockValues[atom.key](atom.params);
  }

  const mockValue = mockValues[atom.key];
  if (mockValue instanceof Function) {
    return mockValue();
  }

  return mockValue;
};

const resetValue = (atom) => {
  if (atom.params && mockValuesStore[atom.key]) {
    delete mockValuesStore[atom.key][JSON.stringify(atom.params)];
  } else {
    mockValues[atom.key] = mockDefaults[atom.key];
  }
};

const setValue = (atom, value) => {
  if (atom.params) {
    if (!mockValuesStore[atom.key]) mockValuesStore[atom.key] = {};
    const current = mockValuesStore[atom.key][JSON.stringify(atom.params)];
    mockValuesStore[atom.key][JSON.stringify(atom.params)] =
      value instanceof Function ? value(current) : value;
  } else {
    const current = mockValues[atom.key];
    mockValues[atom.key] = value instanceof Function ? value(current) : value;
  }
};

export function waitForAll<T>(deps: T) {
  return { __waitForAll: true, deps };
}

export function atom<T>(options: AtomOptions<T>): Stub {
  return { key: options.key };
}

export function atomFamily<T, P>(options: AtomFamilyOptions<T, P>) {
  return (params: P) => ({
    key: options.key,
    params: params,
  });
}

export function selector<T>(options: ReadWriteSelectorOptions<T>): {
  (): T;
  key: string;
  set: (value: T) => void;
} {
  function resolver() {
    return options.get({ get: getValue }) as T;
  }
  resolver.key = options.key;
  resolver.set = (value) =>
    options.set({ set: setValue, get: getValue, reset: resetValue }, value);
  return resolver;
}

export function selectorFamily<T, P extends SerializableParam>(
  options: ReadWriteSelectorFamilyOptions<T, P>,
): (params: P) => { (): T; key: string; set: (value: T) => void } {
  return (params) => {
    function resolver() {
      return options.get(params)({ get: getValue }) as T;
    }
    resolver.key = options.key;
    resolver.params = params;
    resolver.set = (value) =>
      options.set(params)(
        { set: setValue, get: getValue, reset: resetValue },
        value,
      );
    return resolver;
  };
}

type ValueOf<T> = T extends ReverbValue<infer V> ? V : never;

export type TestSelector<T extends ReverbValue<unknown>> = {
  (): ValueOf<T>;
  key: string;
};

export type TestSelectorFamily<
  T extends (params: P) => ReverbValue<unknown>,
  P = unknown,
> = {
  (): ValueOf<ReturnType<T>>;
  set: (value: ValueOf<ReturnType<T>>) => void;
  key: string;
  params: P;
};
