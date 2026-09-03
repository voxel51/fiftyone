/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createContext, useContext } from "react";
import type { FrameTable } from "../streams/frameTable";

/**
 * The current sample's presentation-order frame table (see
 * `streams/frameTable.ts`), provided by the surface only on the `html` decode
 * strategy — the `<video>` clock is the one time source whose `time × fps`
 * numbering drifts on dropped-frame media. `null` (the default) everywhere
 * else: while the table loads, when the header can't be demuxed, and on the
 * `extract` / `fetch` paths whose times are already presentation-ordered.
 */
export const FrameTableContext = createContext<FrameTable | null>(null);

/** The active frame table, or `null` to fall back to `time × fps` numbering. */
export const useFrameTable = (): FrameTable | null =>
  useContext(FrameTableContext);
