/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Provider, getDefaultStore } from "jotai";
import type React from "react";
import { useState } from "react";
import { DEFAULT_VALUE } from "./sentinel";
import type { MutableSnapshot } from "./types";

interface ReverbRootProps {
  children?: React.ReactNode;
  initializeState?: (mutable: MutableSnapshot) => void;
}

/**
 * The default store, not a fresh one: non-React code reaches state through
 * `getDefaultStore()` directly, and a second store would leave those reads
 * looking at values React never wrote.
 */
export const ReverbRoot = ({ children, initializeState }: ReverbRootProps) => {
  const [store] = useState(() => {
    const shared = getDefaultStore();

    initializeState?.({
      set: (state, next) => shared.set(state, next),
      reset: (state) => shared.set(state, DEFAULT_VALUE),
    });

    return shared;
  });

  return <Provider store={store}>{children}</Provider>;
};
