import { useEffect, useMemo, useRef } from "react";
import useTriggers from "./useTriggers";
import type { TrajectoryViewProps } from "../types";

type Triggers = {
  getFrameMedia: (payload: { frame_ids: string[] }) => void;
};

export type UseFrameMediaResult = {
  media: Record<string, string>;
};

/**
 * Bridge to the Python panel's get_frame_media method.
 *
 * Given the set of frame ids needed for rendering thumbnails (typically
 * the jump frames across the active scene(s)), requests filepaths in a
 * single batch. The returned media map merges across calls so flipping
 * between scenes doesn't make thumbnails flicker.
 */
export function useFrameMedia(
  props: TrajectoryViewProps,
  frameIds: string[]
): UseFrameMediaResult {
  const { schema, data } = props;

  const triggers = useTriggers<Triggers>({
    getFrameMedia: schema.view.get_frame_media,
  });

  // Dedup + sort so the signature is stable regardless of input order.
  const sig = useMemo(() => {
    const dedup = Array.from(new Set(frameIds)).sort();
    return dedup.join("|");
  }, [frameIds]);

  const lastRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!sig) return;
    if (lastRequest.current === sig) return;
    lastRequest.current = sig;
    triggers.getFrameMedia({ frame_ids: sig.split("|") });
  }, [sig, triggers]);

  // Accumulate across batches so previously-resolved frames stay
  // visible even when the latest batch only covers a subset.
  const accumRef = useRef<Record<string, string>>({});
  const media = useMemo(() => {
    const incoming = data?.frame_media ?? {};
    accumRef.current = { ...accumRef.current, ...incoming };
    return accumRef.current;
  }, [data?.frame_media]);

  return { media };
}
