import type { AnnotationEngine } from "@fiftyone/annotation";
import type { useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel, AnnotationLabelData } from "@fiftyone/state";
import { getDefaultStore } from "jotai";
import { useCallback, useRef } from "react";
import {
  SINGULAR,
  byLabelName,
  sameData,
  sameEntry,
  stubOverlay,
} from "./labelRows";
import { labels } from "./labelsAtoms";

type LighterScene = ReturnType<typeof useLighter>["scene"];

/**
 * Derive the sidebar label rows from the engine into the `labels` atom. Every
 * in-scope engine label gets a row (live overlay or stub); engine-unknown rows
 * pass through unless the engine knew them last pass.
 */
export const useReconcileLabels = ({
  engine,
  scene,
  active,
  sampleId,
}: {
  engine: AnnotationEngine;
  scene: LighterScene;
  active: string[] | null;
  sampleId: string | null | undefined;
}): (() => void) => {
  // ids derived on the last pass, and for which sample; a sample switch starts
  // from an empty list
  const derivedIds = useRef<Set<string>>(new Set());
  const derivedFor = useRef<string | null>(null);

  return useCallback(() => {
    if (!sampleId || !active) {
      return;
    }

    const store = getDefaultStore();
    const current = store.get(labels);
    const previous = derivedFor.current === sampleId ? current : [];
    const previousById = new Map(previous.map((l) => [l.data._id, l]));
    const engineIds = new Set<string>();
    const next: AnnotationLabel[] = [];

    for (const path of active) {
      const type = SINGULAR[engine.getLabelType(path)];

      if (!type) {
        continue;
      }

      for (const data of engine.listLabels({ sample: sampleId, path })) {
        engineIds.add(data._id);

        // the scene keys overlays by the engine `instanceId`, which differs
        // from the doc `_id` for a per-frame video track
        const instanceId =
          (data as { instance?: { _id?: string } }).instance?._id ?? data._id;

        const prev = previousById.get(data._id);
        const mounted = scene?.getOverlay(instanceId);
        const live = mounted && mounted.field === path ? mounted : undefined;

        // keep stub identity while the data is unchanged; a data change
        // rebuilds the stub so its label never goes stale
        const overlay = (live ??
          (prev && sameData(prev.data, data as AnnotationLabelData)
            ? prev.overlay
            : stubOverlay(
                data._id,
                path,
                data as AnnotationLabelData,
              ))) as AnnotationLabel["overlay"];

        const entry = {
          data: data as AnnotationLabelData,
          overlay,
          path,
          type,
        } as AnnotationLabel;
        next.push(prev && sameEntry(prev, entry) ? prev : entry);
      }
    }

    // a row the engine knew last pass and no longer does was deleted
    for (const label of previous) {
      if (
        !engineIds.has(label.data._id) &&
        !derivedIds.current.has(label.data._id)
      ) {
        next.push(label);
      }
    }

    derivedIds.current = engineIds;
    derivedFor.current = sampleId;

    next.sort(byLabelName);

    const unchanged =
      next.length === current.length &&
      next.every((entry, index) => entry === current[index]);

    if (!unchanged) {
      store.set(labels, next);
    }
  }, [active, engine, sampleId, scene]);
};
