/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useOperators } from "@fiftyone/operators";
import { useCurrentDatasetName } from "@fiftyone/state";
import type React from "react";
import { useState, useSyncExternalStore } from "react";

/** What a product contributes to the App shell. */
export interface Product {
  /** Stable, globally namespaced identity. */
  readonly id: string;
  /** The wordmark beside the logo. */
  readonly title: string;
  /** Whether the header offers the Enterprise call to action. */
  readonly enterpriseCta: boolean;
  /** Drawn between the dataset selector and the view bar. */
  readonly Status?: React.ComponentType;
  /** The panels the product ships, rendered inside the dataset's query context. */
  readonly Panels?: React.ComponentType;
  /** The name to show for the loaded dataset. */
  readonly useDatasetDisplayName: () => string | null;
  /**
   * Whether the operators an empty screen offers have been discovered. A
   * product that scopes operators differently answers for its own scoping.
   */
  readonly useOperatorsStatus: () => { hasError: boolean; isLoading: boolean };
}

const OPEN_SOURCE: Product = {
  id: "fiftyone:open-source",
  title: "FiftyOne",
  enterpriseCta: true,
  useDatasetDisplayName: useCurrentDatasetName,
  useOperatorsStatus: () => useOperators(true),
};

interface ProductState {
  product: Product;
  listeners?: Set<() => void>;
}

const SLOT = Symbol.for("@fiftyone/app:product");
const globalRegistry = globalThis as Record<PropertyKey, unknown>;
const state = (globalRegistry[SLOT] ??= {
  product: OPEN_SOURCE,
}) as ProductState;
const listeners = (state.listeners ??= new Set<() => void>());

const publish = (): void => {
  for (const listener of listeners) listener();
};

/**
 * Registers what this build's product contributes to the shell.
 *
 * A second product claiming the slot is an architectural error. The same id
 * registering again replaces it, for an injection root a bundler re-evaluates
 * without giving it a disposal hook.
 */
export const registerProduct = (product: Product): (() => void) => {
  if (state.product === product) return () => undefined;
  if (state.product.id !== OPEN_SOURCE.id && state.product.id !== product.id) {
    throw new Error(`A product is already registered: ${state.product.id}`);
  }

  state.product = product;
  publish();
  return () => {
    if (state.product !== product) return;
    state.product = OPEN_SOURCE;
    publish();
  };
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): Product => state.product;

/** What this build's product contributes to the shell. */
export const useProduct = (): Product =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/**
 * The name to show for the loaded dataset.
 *
 * The contributed hook is the one this component mounted with: a product
 * registers from the injection root, before the shell's first render, and
 * swapping hooks mid-life would change what React sees.
 */
export const useDatasetDisplayName = (): string | null => {
  const [useName] = useState(() => state.product.useDatasetDisplayName);

  return useName();
};

/** Test-only reset, kept out of what the shell imports. */
export const resetProductForTests = (): void => {
  state.product = OPEN_SOURCE;
  publish();
};
