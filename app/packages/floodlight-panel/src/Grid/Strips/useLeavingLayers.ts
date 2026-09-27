/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEffect, useState } from "react";
import { reducedMotion } from "./flip";
import { MOTION_MS } from "./stackLayout";

interface Track {
  ids: string[];
  position: number;
  leaving: string[];
  /** Sign of the last step: 1 deeper, -1 back, 0 for a reset or page. */
  direction: number;
}

/**
 * Keeps front items that a forward step removed mounted for the fly-out,
 * in the same render that removes them, so their lookers never blink.
 */
export default function useLeavingLayers(ids: string[], position: number) {
  const [track, setTrack] = useState<Track>({
    direction: 0,
    ids,
    leaving: [],
    position,
  });

  let current = track;
  if (track.position !== position || track.ids.join() !== ids.join()) {
    const direction = Math.sign(position - track.position);
    const gone =
      direction > 0 && !reducedMotion()
        ? track.ids.filter((id) => !ids.includes(id))
        : [];
    current = {
      direction,
      ids,
      leaving: [...track.leaving, ...gone].filter((id) => !ids.includes(id)),
      position,
    };
    setTrack(current);
  }

  useEffect(() => {
    if (!track.leaving.length) return undefined;
    const timeout = setTimeout(
      () => setTrack((last) => ({ ...last, leaving: [] })),
      MOTION_MS,
    );
    return () => clearTimeout(timeout);
  }, [track.leaving]);

  return current;
}
