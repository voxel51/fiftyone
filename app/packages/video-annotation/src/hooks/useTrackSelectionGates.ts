import { useMemo } from "react";
import {
  useSelectedInstanceTrackField,
  useSelectedTrackIds,
  useSelectionIsInstanceTrack,
  useSelectionIsKeyframeable,
} from "../state/useVideoSelection";
import { useFrameKeyframeState } from "./useFrameKeyframeState";

export interface TrackSelectionGates {
  /** Selected engine instance ids. */
  selectedIds: string[];
  hasSelection: boolean;
  selectionIsKeyframeable: boolean;
  selectionIsInstanceTrack: boolean;
  /** The selected track's own frames field, when exactly one is selected. */
  selectedTrackField: string | null;
  /** Whether the single selected track has a keyframe at the playhead. */
  isKeyframeAtPlayhead: boolean;
  canMarkKeyframe: boolean;
  canSplit: boolean;
}

/** Selection-derived enablement for the keyframe and split toolbar actions. */
export const useTrackSelectionGates = (
  playhead: number,
  hasUsableFps: boolean,
): TrackSelectionGates => {
  const selected = useSelectedTrackIds();
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const hasSelection = selectedIds.length > 0;

  const selectionIsKeyframeable = useSelectionIsKeyframeable();
  const selectionIsInstanceTrack = useSelectionIsInstanceTrack();
  const selectedTrackField = useSelectedInstanceTrackField();
  const isKeyframeAtPlayhead = useFrameKeyframeState(selectedIds, playhead);

  return {
    selectedIds,
    hasSelection,
    selectionIsKeyframeable,
    selectionIsInstanceTrack,
    selectedTrackField,
    isKeyframeAtPlayhead,
    canMarkKeyframe: hasSelection && selectionIsKeyframeable,
    canSplit:
      selectedIds.length === 1 && selectionIsInstanceTrack && hasUsableFps,
  };
};
