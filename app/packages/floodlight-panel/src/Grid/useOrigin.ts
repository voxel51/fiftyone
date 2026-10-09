/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useState } from "react";
import type { OrderSeek } from "./pageCursors";
import usePanelMemo from "./panelMemory";
import type { Origin } from "./useSpotlightPager";

/**
 * Where the grid's pages start, kept with the panel's pages for the data
 * shown: a seek moves it, and the newest seek wins.
 */
export default function useOrigin(pageReset: string) {
  const held = usePanelMemo("origin", pageReset, () => ({
    current: { id: 0 } as Origin,
  }));
  const [origin, setOrigin] = useState(held.current);
  const current = origin.id === held.current.id ? origin : held.current;

  const seek = useCallback(
    (to: OrderSeek) => {
      held.current = { id: held.current.id + 1, seek: to };
      setOrigin(held.current);
    },
    [held],
  );

  return [current, seek] as const;
}
