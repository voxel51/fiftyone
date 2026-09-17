/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";
import type { LocationModel, LocationStore, ParamDef } from "./model";

const StoreContext = createContext<LocationStore<unknown> | undefined>(
  undefined,
);

export const LocationProvider = <R,>({
  store,
  children,
}: React.PropsWithChildren<{ store: LocationStore<R> }>) => (
  <StoreContext.Provider value={store as LocationStore<unknown>}>
    {children}
  </StoreContext.Provider>
);

const useStore = (): LocationStore<unknown> => {
  const store = useContext(StoreContext);
  if (!store) throw new Error("no LocationProvider in the tree");
  return store;
};

/**
 * The route type is the host's, and a context cannot be generic, so the caller
 * names it. Params need no such annotation: their types come from the def.
 */
export const useLocation = <R,>(): LocationModel<R> => {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.get) as LocationModel<R>;
};

export const useLocationParam = <T,>(
  def: ParamDef<T>,
): [T, (value: T) => void] => {
  const store = useStore();
  const value = useSyncExternalStore(store.subscribe, () => store.read(def));
  const set = useCallback((next: T) => store.write(def, next), [store, def]);
  return [value, set];
};
