import {
  type ReconciledDetection3D,
  type ReconciledPolyline3D,
  useUpdateWorkingLabel,
  useWorkingDoc,
  type WorkingDoc,
} from "@fiftyone/looker-3d";
import {
  equalsNormalized,
  type LabelData,
  type Sample,
  type SampleChange,
  SampleChangeKind,
} from "@fiftyone/utilities";
import { useEffect, useRef } from "react";
import { build3dLabel } from "./build3dLabel";
import { useSampleInstance } from "./useSample";

/** A label update to apply onto the 3D working store. */
interface Working3dUpsert {
  labelId: string;
  data: LabelData;
}

/**
 * Decide how one Sample change reconciles onto the 3D working store (the
 * read-half).
 *
 * **Update-only by design.** 3D deletes are owned by the working store
 * (`deleteCuboid`/`deletePolyline`) and never originate from Sample — the
 * sidebar delete command is disabled for 3D labels.
 *
 * A list-label change with no `labelId` addresses the whole field (e.g.
 * `reconcilePersisted` releasing a field, keyed by the parent). Those fan out
 * to each element by `_id`; resolving the parent path yields the list
 * container, not a label.
 */
export const reconcile3dChange = (
  doc: WorkingDoc,
  sample: Sample,
  change: SampleChange
): Working3dUpsert[] => {
  if (change.kind === SampleChangeKind.Delete || change.path === "") {
    return [];
  }

  if (change.labelId) {
    if (!doc.labelsById[change.labelId]) {
      return [];
    }
    const data = sample.getLabel(change.path, change.labelId);
    return data ? [{ labelId: change.labelId, data }] : [];
  }

  if (sample.isListLabel(change.path)) {
    const upserts: Working3dUpsert[] = [];
    for (const label of sample.listLabels(change.path)) {
      if (label._id && doc.labelsById[label._id]) {
        upserts.push({ labelId: label._id, data: label });
      }
    }
    return upserts;
  }

  return [];
};

/**
 * Bidirectional bridge between the 3D annotation working store (Recoil, keyed
 * by sampleId) and the shared {@link Sample}. Mount once at the annotation
 * root.
 *
 * - **Write-half:** on each committed working-store mutation, push the current
 *   label set into Sample — `updateLabel` for present labels, `deleteLabel`
 *   for soft-deleted ones. Skips labels whose persistable shape already equals
 *   Sample's resolved value (the idempotent guard), so a value the read-half
 *   just applied isn't echoed back.
 * - **Read-half:** Sample changes are reconciled back onto the working store
 *   via {@link reconcile3dChange} + `useUpdateWorkingLabel` (which merges over
 *   the existing label, preserving view-only fields and re-rounding geometry).
 *   This is what makes the 3D viewport reactive to sidebar label edits, undo,
 *   and persistence reconciliation now that those write Sample directly.
 *
 * **Loop breaking (two mechanisms, both required).** `updateLabel` notifies
 * unconditionally, so:
 * 1. A `writing` ref wraps the write-half. `notify` dispatches synchronously,
 *    so the read-half runs inside the `writing` window and skips changes the
 *    write-half authored — origin suppression by call stack.
 * 2. The idempotent guard covers the case the ref can't: an external change
 *    flows Sample→working, the working doc mutates, and the write-half effect
 *    re-runs *asynchronously* (ref already cleared). Without the guard it would
 *    re-push the just-applied value — needless churn, and for a released
 *    server-owned field it would resurrect the value the release just dropped.
 */
export const useSync3dSample = (): void => {
  const doc = useWorkingDoc();
  const sample = useSampleInstance();
  const updateWorkingLabel = useUpdateWorkingLabel();

  // Latest working doc, read by the read-half subscription (which stays
  // subscribed across doc changes rather than re-subscribing each one).
  const docRef = useRef(doc);
  docRef.current = doc;

  // Set while the write-half pushes to Sample; see mechanism (1) above.
  const writing = useRef(false);

  // Write-half: mirror committed working-store edits onto Sample.
  useEffect(() => {
    writing.current = true;
    try {
      for (const label of Object.values(doc.labelsById)) {
        if (doc.deletedIds.has(label._id)) {
          continue;
        }

        const data = build3dLabel(label);
        if (!data) {
          continue;
        }

        // Idempotent guard: skip pushes that merely echo Sample's truth.
        if (equalsNormalized(data, sample.getLabel(label.path, label._id))) {
          continue;
        }

        sample.updateLabel(label.path, data);
      }

      for (const id of doc.deletedIds) {
        const label = doc.labelsById[id];
        if (label && sample.getLabel(label.path, id)) {
          sample.deleteLabel(label.path, id);
        }
      }
    } finally {
      writing.current = false;
    }
  }, [doc, sample]);

  // Read-half: reconcile Sample changes back onto the working store.
  useEffect(() => {
    return sample.subscribeChanges((changes) => {
      if (writing.current) {
        return;
      }

      for (const change of changes) {
        for (const { labelId, data } of reconcile3dChange(
          docRef.current,
          sample,
          change
        )) {
          updateWorkingLabel(
            labelId,
            data as Partial<ReconciledDetection3D> &
              Partial<ReconciledPolyline3D>
          );
        }
      }
    });
  }, [sample, updateWorkingLabel]);
};
