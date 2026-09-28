import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  publishDemandMapSnapshot,
  type DemandHandlers,
  type DemandInventoryReplay,
  type DemandRegistry,
} from "../demand-bridge";
import { useDemandRegistry } from "./demand-registry";

/** Handler contract for providers with a lazy inventory picker. */
export interface DemandContextHandlers extends DemandHandlers {
  ensureInventory(): void;
}

/** Shared provider state consumed by one source-scoped demand bridge. */
export interface DemandContextController<
  InventoryState,
  Value,
  Handlers extends DemandContextHandlers,
> extends DemandRegistry<Handlers> {
  readonly ensureInventory: () => void;
  readonly inventory: InventoryState;
  readonly inventoryReplay: DemandInventoryReplay<Handlers>;
  readonly publishValues: (
    source: ReadonlyMap<string, Value>,
    isCancelled: () => boolean,
  ) => void;
  readonly reset: () => void;
  readonly setInventory: (state: InventoryState) => void;
  readonly setValuesByKey: (state: ReadonlyMap<string, Value>) => void;
  readonly valuesByKey: ReadonlyMap<string, Value>;
}

/** Static policy for one demand-context provider family. */
export interface DemandContextProviderOptions<InventoryState, Value> {
  readonly displayName: string;
  readonly emptyValues: ReadonlyMap<string, Value>;
  readonly idleInventory: InventoryState;
  readonly missingProviderMessage: string;
}

/** Provider and internal hook generated for one demand-context family. */
export interface DemandContextProviderFactory<
  InventoryState,
  Value,
  Handlers extends DemandContextHandlers,
> {
  readonly Provider: React.FC<{ readonly children: React.ReactNode }>;
  readonly useDemandContext: () => DemandContextController<
    InventoryState,
    Value,
    Handlers
  >;
  /** Nullable accessor for surfaces that may render without the provider. */
  readonly useOptionalDemandContext: () => DemandContextController<
    InventoryState,
    Value,
    Handlers
  > | null;
}

/** Creates the shared state, registry, inventory, and reset provider scaffold. */
export function createDemandContextProvider<
  InventoryState,
  Value,
  Handlers extends DemandContextHandlers,
>({
  displayName,
  emptyValues,
  idleInventory,
  missingProviderMessage,
}: DemandContextProviderOptions<
  InventoryState,
  Value
>): DemandContextProviderFactory<InventoryState, Value, Handlers> {
  const Context = createContext<DemandContextController<
    InventoryState,
    Value,
    Handlers
  > | null>(null);

  const Provider: React.FC<{ readonly children: React.ReactNode }> = ({
    children,
  }) => {
    const [inventory, setInventory] = useState(idleInventory);
    const [valuesByKey, setValuesByKey] = useState(emptyValues);
    const { handlersRef, refCountsRef, subscribeKey } =
      useDemandRegistry<Handlers>();
    const inventoryWantedRef = useRef(false);

    const ensureInventory = useCallback(() => {
      inventoryWantedRef.current = true;
      handlersRef.current?.ensureInventory();
    }, [handlersRef]);
    const inventoryReplay = useMemo<DemandInventoryReplay<Handlers>>(
      () => ({
        ensure: (handlers) => handlers.ensureInventory(),
        wantedRef: inventoryWantedRef,
      }),
      [],
    );
    const publishValues = useCallback(
      (source: ReadonlyMap<string, Value>, isCancelled: () => boolean) =>
        publishDemandMapSnapshot(source, setValuesByKey, isCancelled),
      [],
    );
    const reset = useCallback(() => {
      setInventory(idleInventory);
      setValuesByKey(emptyValues);
    }, []);
    const value = useMemo<
      DemandContextController<InventoryState, Value, Handlers>
    >(
      () => ({
        ensureInventory,
        handlersRef,
        inventory,
        inventoryReplay,
        publishValues,
        refCountsRef,
        reset,
        setInventory,
        setValuesByKey,
        subscribeKey,
        valuesByKey,
      }),
      [
        ensureInventory,
        handlersRef,
        inventory,
        inventoryReplay,
        publishValues,
        refCountsRef,
        reset,
        subscribeKey,
        valuesByKey,
      ],
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
  };
  Provider.displayName = displayName;

  const useDemandContext = () => {
    const value = useContext(Context);
    if (!value) throw new Error(missingProviderMessage);
    return value;
  };

  const useOptionalDemandContext = () => useContext(Context);

  return { Provider, useDemandContext, useOptionalDemandContext };
}

/** Clears provider-owned publications after its bridge leaves the tree. */
export function useResetDemandContextOnUnmount(reset: () => void): void {
  // This effect clears source publications when a shorter-lived bridge
  // unmounts while its provider remains mounted.
  useEffect(() => () => reset(), [reset]);
}
