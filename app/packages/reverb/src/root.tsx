/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Provider, getDefaultStore } from "jotai";
import type { Store } from "./transaction";
import type React from "react";
import { useState } from "react";
import { DEFAULT_VALUE } from "./sentinel";
import type { MutableSnapshot } from "./types";

interface ReverbRootProps {
  children?: React.ReactNode;
  initializeState?: (mutable: MutableSnapshot) => void;
  /** Isolates this root's state. Tests pass one so they do not share writes. */
  store?: Store;
}

/** Stores already initialized, so a repeated mount pass does not write twice. */
const initialized = new WeakSet<Store>();

/**
 * The default store, not a fresh one: non-React code reaches state through
 * `getDefaultStore()` directly, and a second store would leave those reads
 * looking at values React never wrote.
 */
export const ReverbRoot = ({
  children,
  initializeState,
  store: provided,
}: ReverbRootProps) => {
  const [store] = useState(() => provided ?? getDefaultStore());

  /**
   * Tracked against the store rather than in a ref, because React renders a
   * component twice on mount in development and both passes are mounts, so a
   * ref is fresh each time. The store outlives both, so an initializer
   * written as an update would otherwise apply twice.
   */
  if (initializeState && !initialized.has(store)) {
    initialized.add(store);

    initializeState({
      set: (state, next) => store.set(state, next),
      reset: (state) => store.set(state, DEFAULT_VALUE),
    });
  }

  return <Provider store={store}>{children}</Provider>;
};
