import {
  type LighterInteractionPolicy,
  combineInteractionPolicies,
} from "@fiftyone/annotation";
import { useMemo } from "react";
import { useDraftLockInteraction } from "./useDraftLockInteraction";
import { useGeneratedViewInteraction } from "./useGeneratedViewInteraction";
import { useMergeToolInteraction } from "./useMergeToolInteraction";

/**
 * The modal's interaction policy for the Lighter surface: a formalized
 * aggregation of independent, single-concern interceptors — each owns one
 * piece of selection behavior and decides for itself when it applies. The
 * first to consume a gesture wins, so ORDER is the only cross-concern fact
 * encoded here: the Merge tool gets first refusal, then the generated-view
 * stickiness, then the draft lock.
 */
export const useLighterInteractionPolicy = (): LighterInteractionPolicy => {
  const mergeTool = useMergeToolInteraction();
  const generatedView = useGeneratedViewInteraction();
  const draftLock = useDraftLockInteraction();

  return useMemo(
    () => combineInteractionPolicies([mergeTool, generatedView, draftLock]),
    [mergeTool, generatedView, draftLock]
  );
};
