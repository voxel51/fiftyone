/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Connects the header's relayout demo button to this panel's grid.
 */

import { createContext, useContext } from "react";

export interface RelayoutDemo {
  /** Removes `ids` from view; a no-op until a grid answers. */
  run(ids: Set<string>): void;
  /** The grid's handler, or `undefined` when it unmounts. */
  answer(handler: ((ids: Set<string>) => void) | undefined): void;
}

export const createRelayoutDemo = (): RelayoutDemo => {
  let handler: ((ids: Set<string>) => void) | undefined;
  return {
    run: (ids) => handler?.(ids),
    answer: (next) => {
      handler = next;
    },
  };
};

export const RelayoutDemoContext = createContext<RelayoutDemo | undefined>(
  undefined,
);

export const useRelayoutDemo = () => useContext(RelayoutDemoContext);
