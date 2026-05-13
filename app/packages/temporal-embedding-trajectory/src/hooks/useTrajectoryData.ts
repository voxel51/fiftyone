import { useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import useTriggers from "./useTriggers";
import type {
  BrainKeyInfo,
  SceneTrajectory,
  TrajectoryViewProps,
} from "../types";

type Triggers = {
  listBrainKeys: (payload?: Record<string, unknown>) => void;
  getSceneTrajectory: (payload: {
    brain_key: string;
    sample_id: string;
  }) => void;
  computeTrajectory: (payload: { model: string; brain_key: string }) => void;
  seekToFrame: (payload: { sample_id: string; frame_number: number }) => void;
};

export type UseTrajectoryDataResult = {
  brainKeys: BrainKeyInfo[];
  scene: SceneTrajectory | null;
  selectedBrainKey: string | null;
  setSelectedBrainKey: (key: string | null) => void;
  triggers: Triggers;
  currentSampleId: string | null;
};

/**
 * Bridge from the Python panel's data + methods to a typed view-state
 * object. Handles:
 *   - mapping `props.schema.view.<method>` to call-shimmed triggers
 *   - reading the available brain keys from panel data
 *   - re-requesting trajectory data whenever the current sample or
 *     selected brain key changes
 */
export function useTrajectoryData(
  props: TrajectoryViewProps,
  selectedBrainKeyState: [string | null, (k: string | null) => void]
): UseTrajectoryDataResult {
  const { schema, data } = props;
  const [selectedBrainKey, setSelectedBrainKey] = selectedBrainKeyState;

  const triggers = useTriggers<Triggers>({
    listBrainKeys: schema.view.list_brain_keys,
    getSceneTrajectory: schema.view.get_scene_trajectory,
    computeTrajectory: schema.view.compute_trajectory,
    seekToFrame: schema.view.seek_to_frame,
  });

  const brainKeys = useMemo<BrainKeyInfo[]>(
    () => (data?.brain_keys as BrainKeyInfo[]) ?? [],
    [data?.brain_keys]
  );

  // Default to the first brain key when one becomes available.
  useEffect(() => {
    if (!selectedBrainKey && brainKeys.length > 0) {
      setSelectedBrainKey(brainKeys[0].key);
    }
  }, [brainKeys, selectedBrainKey, setSelectedBrainKey]);

  // Current modal sample id — drives which scene is requested.
  const modalSample = useRecoilValue(fos.modalSample);
  const currentSampleId = useMemo<string | null>(() => {
    const sid =
      (modalSample as any)?.sample?._id ??
      (modalSample as any)?.sample?.id ??
      null;
    return sid ? String(sid) : null;
  }, [modalSample]);

  // Re-fetch the scene whenever sample or brain key changes.
  const lastRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!currentSampleId || !selectedBrainKey) return;
    const key = `${selectedBrainKey}::${currentSampleId}`;
    if (lastRequest.current === key) return;
    lastRequest.current = key;
    triggers.getSceneTrajectory({
      brain_key: selectedBrainKey,
      sample_id: currentSampleId,
    });
  }, [currentSampleId, selectedBrainKey, triggers]);

  const scene = useMemo<SceneTrajectory | null>(() => {
    const payload = data?.scene_trajectory ?? null;
    if (!payload) return null;
    // Only show the payload if it matches the current sample, so a
    // stale response from a previous scene doesn't flicker on screen.
    if (currentSampleId && payload.sample_id !== currentSampleId) return null;
    return payload;
  }, [data?.scene_trajectory, currentSampleId]);

  return {
    brainKeys,
    scene,
    selectedBrainKey,
    setSelectedBrainKey,
    triggers,
    currentSampleId,
  };
}
