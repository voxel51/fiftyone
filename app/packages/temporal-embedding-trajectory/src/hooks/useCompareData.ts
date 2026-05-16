import { useEffect, useMemo, useRef } from "react";
import useTriggers from "./useTriggers";
import type { SceneTrajectory, TrajectoryViewProps } from "../types";

type Triggers = {
  getCompareTrajectories: (payload: {
    brain_keys: string[];
    sample_id: string;
  }) => void;
};

export type UseCompareDataResult = {
  scenes: Record<string, SceneTrajectory>;
};

/**
 * Bridge to the Python panel's get_compare_trajectories method.
 *
 * Re-requests on every change to currentSampleId or selectedKeys.
 * Filters returned payloads to the current sample so stale responses
 * from a previous scene don't leak through.
 */
export function useCompareData(
  props: TrajectoryViewProps,
  currentSampleId: string | null,
  selectedKeys: string[]
): UseCompareDataResult {
  const { schema, data } = props;

  const triggers = useTriggers<Triggers>({
    getCompareTrajectories: schema.view.get_compare_trajectories,
  });

  const keySig = useMemo(
    () => [...selectedKeys].sort().join("|"),
    [selectedKeys]
  );

  const lastRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!currentSampleId || selectedKeys.length === 0) return;
    const sig = `${currentSampleId}::${keySig}`;
    if (lastRequest.current === sig) return;
    lastRequest.current = sig;
    triggers.getCompareTrajectories({
      brain_keys: selectedKeys,
      sample_id: currentSampleId,
    });
  }, [currentSampleId, keySig, selectedKeys, triggers]);

  const scenes = useMemo<Record<string, SceneTrajectory>>(() => {
    const raw = data?.compare_trajectories ?? {};
    if (!currentSampleId) return {};
    const out: Record<string, SceneTrajectory> = {};
    for (const [key, payload] of Object.entries(raw)) {
      if (payload && payload.sample_id === currentSampleId) {
        out[key] = payload;
      }
    }
    return out;
  }, [data?.compare_trajectories, currentSampleId]);

  return { scenes };
}
