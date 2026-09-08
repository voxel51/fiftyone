/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEndPointSession } from "@fiftyone/annotation";
import { useEffect, useRef } from "react";
import { useCurrentFrame } from "../state/useCurrentFrame";

/**
 * End the AI point-prompt session whenever the playhead lands on a different
 * frame. Points describe the pixels of one frame, so carrying them across a
 * frame change would prompt the new frame with stale coordinates while the user
 * looks at keypoints that no longer mark anything on screen — and carrying the
 * *target* across would make the next click refine the previous object (whose
 * track the commit auto-extended onto this frame) rather than start a new one.
 *
 * Cheap when nothing is pending, so ticking through frames during playback
 * costs nothing.
 *
 * **Mount once** in the video surface, inside the `<PlaybackProvider>`.
 */
export const useEndPointSessionOnFrameChange = (): void => {
  const frame = useCurrentFrame();
  const endPointSession = useEndPointSession();

  // Ref so the effect fires on frame changes alone — the callback's identity
  // churns with every render of the surface.
  const endRef = useRef(endPointSession);
  endRef.current = endPointSession;

  const lastFrame = useRef<number | null>(null);

  useEffect(() => {
    const previousFrame = lastFrame.current;
    lastFrame.current = frame;

    // Mounting is not a transition. AI mode outlives a surface remount (its
    // state is module-scoped), so ending the session on the effect's first run
    // would drop a live one — the very thing this hook exists to scope.
    if (previousFrame === null) {
      return;
    }

    endRef.current();
  }, [frame]);
};
