import type { LighterInteractionPolicy } from "@fiftyone/annotation";
import {
  DetectionOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { getDefaultStore } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import useExit from "./Edit/useExit";
import { useMergeTool } from "./Edit/useMergeTool";
import {
  SegmentationTool,
  _unsafeSegmentationModeActiveAtom,
  _unsafeToolAtom,
} from "./Edit/useSegmentationMode";

const STORE = getDefaultStore();

const isMergeToolActive = (): boolean =>
  STORE.get(_unsafeSegmentationModeActiveAtom) &&
  STORE.get(_unsafeToolAtom) === SegmentationTool.Merge;

/**
 * The Merge tool's interaction ownership. While the tool is active it
 * consumes mask clicks (a source-click merges into the target, a target
 * re-click no-ops) and holds the selection (deselect gestures are swallowed);
 * when the scene's selection clears (e.g. right-click) it drops the merge
 * target and exits. Inert when the tool is not active — it self-gates on
 * {@link isMergeToolActive}, so the aggregating policy needs no knowledge of
 * the merge tool.
 */
export const useMergeToolInteraction = (): LighterInteractionPolicy => {
  const { scene } = useLighter();
  const mergeTool = useMergeTool();
  const onExit = useExit();

  // event-time reads — the gesture handlers must see the latest without
  // re-subscribing (a stable policy identity keeps the engine bridge from
  // re-binding its select/deselect routes)
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const mergeToolRef = useRef(mergeTool);
  mergeToolRef.current = mergeTool;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const interceptSelect = useCallback((id: string): boolean => {
    if (!isMergeToolActive()) {
      return false;
    }

    const overlay = sceneRef.current?.getOverlay(id);

    if (overlay instanceof DetectionOverlay) {
      // `true` = a re-click of the target or a source-click that performed a
      // merge → skip selection routing. `false` = a first-click adopting a
      // new target → fall through so the gesture loads it.
      return mergeToolRef.current.handleOverlayClick(overlay);
    }

    return false;
  }, []);

  const interceptDeselect = useCallback((): boolean => isMergeToolActive(), []);

  // selection cleared (e.g. right-click deselect): drop the target + exit
  const on = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
  on(
    "lighter:selection-cleared",
    useCallback((payload: { ignoreSideEffects?: boolean }) => {
      if (!isMergeToolActive()) {
        return;
      }

      mergeToolRef.current.clearMergeTarget();

      if (!payload.ignoreSideEffects) {
        onExitRef.current();
      }
    }, []),
  );

  return useMemo(
    () => ({ interceptSelect, interceptDeselect }),
    [interceptSelect, interceptDeselect],
  );
};
