/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Sample } from "@fiftyone/looker";
import {
  getLocalSample,
  hasLocalSample,
  seedLocalSample,
  useUpdateSamples,
} from "@fiftyone/state";
import { useCallback, useRef } from "react";
import type { LabelFieldDelta } from "../deltas";
import { applyDeltaToSample } from "./applyDelta";
import { useAnnotationTargetSample } from "./useAnnotationTargetSample";
import { pendingEdits } from "./pendingEdits";

export type RecordEdit = (sampleId: string, delta: LabelFieldDelta) => void;

/**
 * The single entry point for every annotation edit, from every surface
 * (canvas, sidebar, 3D): record the delta in the pending-edits ledger AND
 * write its new value through to the canonical sample copy in one synchronous
 * step.
 *
 * The write-through is what keeps one shared cache instead of N divergent
 * ones: the canonical copy always equals `server-known state + every pending
 * edit`, so the modal (back/forward navigation), the grid tile, and the next
 * delta's precondition baseline all read the same data — before, during, and
 * after the save. Persistence timing becomes invisible to display.
 */
export const useRecordEdit = (): RecordEdit => {
  const updateSamples = useUpdateSamples();
  const targetSample = useAnnotationTargetSample();

  // The freshest fetched copy, for seeding only — kept in a ref so a
  // long-lived event handler never holds a stale closure. Resolved by active
  // viewer so a 3D edit seeds from its own slice's sample (e.g. the pcd), not
  // the 2D active slice.
  const fetchedRef = useRef(targetSample);
  fetchedRef.current = targetSample;

  return useCallback(
    (sampleId, delta) => {
      // First-ever edit of this sample: seed the canonical store from the
      // fetched copy. Safe by construction — with no prior edit there is
      // nothing the fetched copy could be stale relative to.
      if (!hasLocalSample(sampleId)) {
        const fetched = fetchedRef.current;
        if (!fetched || fetched._id !== sampleId) {
          console.warn(
            "Dropped annotation edit: no canonical or fetched copy of sample",
            sampleId
          );
          return;
        }
        seedLocalSample(sampleId, fetched);
      }

      pendingEdits.record(sampleId, delta);

      // Write-through: canonical copy = previous canonical + this edit. The
      // "editor" source tells annotation views (the scene IS the editor) that
      // no re-read is needed; grid tiles and Relay records are synced by the
      // same call.
      const next = {
        ...(getLocalSample(sampleId) as unknown as Record<string, unknown>),
      };
      applyDeltaToSample(next, delta);
      updateSamples([[sampleId, next as unknown as Sample]], {
        source: "editor",
      });
    },
    [updateSamples]
  );
};
