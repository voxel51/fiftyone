import { SaveConflictError } from "@fiftyone/core/src/client";
import type { Sample } from "@fiftyone/looker";
import {
  generatedDatasetName as generatedDatasetNameAtom,
  getLocalSample,
  isGeneratedView,
  useCurrentDatasetId,
  useModalSample,
  useUpdateSamples,
} from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { useAnnotationEventBus } from "../hooks";
import { saveAnnotationDeltas } from "../util";
import { debugLog } from "./debug";
import { pendingEdits } from "./pendingEdits";
import { useAnnotationDeltaSupplier } from "./useAnnotationDeltaSupplier";
import { useRecordEdit } from "./useRecordEdit";

type PersistenceResult = boolean | null;

/**
 * Returns a callback that flushes the pending edits (net original → latest
 * value per edited label/field) to the server; resolves to `null` if there
 * was nothing to persist.
 *
 * 2D canvas edits are already in the ledger (recorded at edit time); the 3D
 * and sidebar surfaces are captured here — for the current sample — and
 * recorded through the same pipeline. The flush itself is per-ledger, not
 * per-modal-sample: EVERY sample with pending edits is saved, so edits made
 * just before navigating away still land. Everything up to the network call
 * is synchronous, so by the first `await` the batch is fully snapshotted —
 * navigation/teardown can proceed safely while the write completes.
 */
export const usePersistAnnotationDeltas =
  (): (() => Promise<PersistenceResult>) => {
    const supplyDeltas = useAnnotationDeltaSupplier();
    const eventBus = useAnnotationEventBus();
    const datasetId = useCurrentDatasetId();
    const sample = useModalSample()?.sample;
    const recordEdit = useRecordEdit();
    const updateSamples = useUpdateSamples();
    const isGenerated = useRecoilValue(isGeneratedView);
    const generatedDatasetName = useRecoilValue(generatedDatasetNameAtom);

    return useCallback(async () => {
      if (!datasetId) {
        return null;
      }

      // Pull the not-yet-event-driven surfaces (3D, sidebar) into the ledger.
      // They are scoped to the modal's current sample by construction.
      const currentSampleId = sample?._id;
      if (currentSampleId) {
        for (const delta of supplyDeltas().deltas) {
          recordEdit(currentSampleId, delta);
        }
      }

      // Snapshot the whole batch synchronously: one net delta set per sample.
      const batches = pendingEdits
        .sampleIds()
        .map((id) => ({ id, deltas: pendingEdits.take(id) }))
        .filter((batch) => batch.deltas.length > 0);
      if (batches.length === 0) {
        return null;
      }

      debugLog("flush", {
        samples: batches.map((b) => ({ id: b.id, deltas: b.deltas.length })),
      });
      eventBus.dispatch("annotation:persistenceInFlight");

      let allOk = true;
      let conflict: SaveConflictError | null = null;
      for (const { id, deltas } of batches) {
        // Write-through at record time guarantees a canonical copy exists for
        // every sample with pending edits.
        const doc = getLocalSample(id);
        if (!doc) {
          debugLog("flush SKIPPED sample (no canonical copy — invariant bug)", {
            id,
          });
          allOk = false;
          continue;
        }

        try {
          const ok = await saveAnnotationDeltas(deltas, {
            datasetId,
            sample: doc,
            getCurrentSample: () => getLocalSample(id),
            // Conflict reconciliation only: an "external" write so the
            // annotation scene re-reads the affected fields. In-place tile/
            // modal update — no grid refresh.
            updateSample: (updated: Sample) =>
              updateSamples([[updated._id, updated]], { source: "external" }),
            isGenerated,
            generatedDatasetName: generatedDatasetName ?? undefined,
            onApplied: (applied) =>
              applied.forEach((d) => pendingEdits.ackApplied(id, d)),
            onConflict: (conflicts) =>
              conflicts.forEach(({ delta, serverDocument }) =>
                pendingEdits.ackConflict(id, delta, serverDocument)
              ),
          });
          allOk = allOk && ok;
        } catch (error) {
          if (error instanceof SaveConflictError) {
            // The ledger has already rebased; surface the first conflict
            // after the rest of the batch has been given its chance to save.
            conflict = conflict ?? error;
          } else {
            throw error;
          }
        }
      }

      if (conflict) {
        throw conflict;
      }
      return allOk;
    }, [
      supplyDeltas,
      datasetId,
      sample,
      recordEdit,
      updateSamples,
      isGenerated,
      generatedDatasetName,
      eventBus,
    ]);
  };
