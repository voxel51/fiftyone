/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Which matrix cell is expanded into a grid, and the rects each side of
 * the animation starts from.
 */

import { createContext, useMemo, useState } from "react";
import type { Anchor } from "../../host/createHost";
import type { CellSource } from "./cellSource";
import type { Rects } from "./flip";

export interface Expansion {
  cell: string;
  title: string;
  source: CellSource;
  recordBase: number;
  /** The stack's front item and its page, where the grid starts. */
  anchor: Anchor<number>;
  /** Stack layer rects captured before the grid takes the lookers. */
  from: Rects;
  /** Brings `description` to the stack's front; resolves the layer ids. */
  seek: (description: string, page: number) => Promise<string[]>;
  /** Set once the grid has loaded and taken the stack's lookers. */
  landed?: boolean;
}

export interface Return {
  cell: string;
  /** Grid tile rects the stack's layers fly back from. */
  from: Rects;
}

export interface Expander {
  expanded: Expansion | null;
  returning: Return | null;
  expand: (expansion: Expansion) => void;
  land: () => void;
  collapse: (from: Rects) => void;
  returned: () => void;
}

export const ExpanderContext = createContext<Expander | null>(null);

/** The element the expanded grid renders into, over the matrix scroller. */
export const OverlayContext = createContext<HTMLElement | null>(null);

export const useExpander = (): Expander => {
  const [expanded, setExpanded] = useState<Expansion | null>(null);
  const [returning, setReturning] = useState<Return | null>(null);

  return useMemo(
    () => ({
      expanded,
      returning,
      expand: (expansion) => {
        setReturning(null);
        setExpanded(expansion);
      },
      land: () =>
        setExpanded((current) => current && { ...current, landed: true }),
      // one batch, so the grid's teardown runs before the layers show again
      collapse: (from) => {
        expanded && setReturning({ cell: expanded.cell, from });
        setExpanded(null);
      },
      returned: () => setReturning(null),
    }),
    [expanded, returning],
  );
};
