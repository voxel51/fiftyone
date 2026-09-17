/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Provider, createStore } from "jotai";
import type React from "react";
import { useState } from "react";
import { DEFAULT_VALUE } from "./sentinel";
import type { MutableSnapshot } from "./types";

interface ReverbRootProps {
  children?: React.ReactNode;
  initializeState?: (mutable: MutableSnapshot) => void;
}

export const ReverbRoot = ({ children, initializeState }: ReverbRootProps) => {
  const [store] = useState(() => {
    const created = createStore();

    initializeState?.({
      set: (state, next) => created.set(state, next),
      reset: (state) => created.set(state, DEFAULT_VALUE),
    });

    return created;
  });

  return <Provider store={store}>{children}</Provider>;
};
