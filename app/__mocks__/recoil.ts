import * as recoil from "recoil";
export * from "recoil";

export let mockValues = {};
export let mockValuesStore = {};
export let mockDefaults = {};
export function setMockAtoms(newMockValues: { [key: string]: any }) {
  mockValues = {
    ...mockValues,
    ...newMockValues,
  };
  mockDefaults = { ...mockDefaults, ...newMockValues };
}

export const getValue = (atom) => {
  if (mockValuesStore[atom.key]) {
    const str = JSON.stringify(atom.params);
    if (mockValuesStore[atom.key].hasOwnProperty(str)) {
      return mockValuesStore[atom.key][JSON.stringify[str]];
    }
  }

  if (atom.params !== undefined) {
    return mockValues[atom.key](atom.params);
  }
  return mockValues[atom.key];
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
    mockValuesStore[atom.key][JSON.stringify(atom.params)] = value;
  } else {
    mockValues[atom.key] = value;
  }
};

export function atom<T>(options: Parameters<typeof recoil.atom<T>>[0]) {
  return { key: options.key };
}

export function atomFamily<T, P extends recoil.SerializableParam>(
  options: Parameters<typeof recoil.atomFamily<T, P>>[0]
) {
  return (params: P) => ({
    key: options.key,
    params: params,
  });
}

const getCallback = (callback) => {
  throw new Error(
    "A getCallback unit test mock has not been implemented. Please test within a hook"
  ); // TODO complete mocking of getCallback
  return (...args: readonly unknown[]) =>
    callback({
      snapshot: new recoil.Snapshot(),
      set: setValue,
      reset: resetValue,
      refresh: (atom) => {},
      node: undefined as unknown as recoil.RecoilState<unknown>,
      gotoSnapshot: (_) => {},
      transact_UNSTABLE: (_) => {},
    })(...args);
};

export function selector<T extends unknown>(
  options: recoil.ReadWriteSelectorOptions<T>
): { (): T; key: string; set: (value: T) => void } {
  function resolver() {
    return options.get({
      get: getValue,
      getCallback,
    }) as T;
  }
  resolver.key = options.key;
  resolver.set = (value) =>
    options.set({ set: setValue, get: getValue, reset: resetValue }, value);
  return resolver;
}

export function selectorFamily<
  T extends unknown,
  P extends recoil.SerializableParam
>(
  options: recoil.ReadWriteSelectorFamilyOptions<T, P>[0]
): (params: P) => { (): T; key: string; set: (value: T) => void } {
  return (params) => {
    function resolver() {
      return options.get(params)({
        get: getValue,
        getCallback,
      }) as T;
    }
    resolver.key = options.key;
    resolver.params = params;
    resolver.set = (value) =>
      options.set({ set: setValue, get: getValue, reset: resetValue }, value);
    return resolver;
  };
}

export type TestSelector<T extends recoil.RecoilValueReadOnly<K>, K = any> = {
  call: () => T["__tag"][0];
  key: string;
};

export type TestSelectorFamily<
  T extends (params: P) => recoil.RecoilValueReadOnly<K>,
  K = any,
  P = any
> = {
  (): ReturnType<T>["__tag"][0];
  key: string;
  params: P;
};
