import type { AnnotationEngine } from "@fiftyone/annotation";
import { isPatchesView } from "@fiftyone/state";
import { useCallback, useRef } from "react";
import { useRecoilValue } from "recoil";
import { SINGULAR } from "./labelRows";
import { useSetEntranceLabel } from "./useAnnotationContextManager";

/**
 * In a patches view, open a single-label patch's source label for editing as
 * soon as the engine knows it. Fires at most once per sample.
 */
export const usePatchLabelEntrance = ({
  engine,
  active,
  sampleId,
}: {
  engine: AnnotationEngine;
  active: string[] | null;
  sampleId: string | null | undefined;
}): (() => void) => {
  const isPatches = useRecoilValue(isPatchesView);
  const setEntranceLabel = useSetEntranceLabel();
  const enteredFor = useRef<string | null>(null);

  return useCallback(() => {
    if (!isPatches || !sampleId || !active || enteredFor.current === sampleId) {
      return;
    }

    // count from the engine, not the mirror; a gated overlay has not mounted
    // yet but still makes the patch single-label
    const all = active.flatMap((path) =>
      SINGULAR[engine.getLabelType(path)]
        ? engine.listLabels({ sample: sampleId, path }).map((label) => ({
            sample: sampleId,
            path,
            instanceId: label._id,
          }))
        : [],
    );

    if (all.length === 1) {
      enteredFor.current = sampleId;
      setEntranceLabel(all[0]);
    }
  }, [active, engine, isPatches, sampleId, setEntranceLabel]);
};
