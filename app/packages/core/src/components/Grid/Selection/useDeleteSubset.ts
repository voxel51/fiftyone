import { useSelectionSubsetDisabledReason } from "@fiftyone/state";
import {
  deleteSubset,
  useInvalidateSelectionScope,
  type SavedSubset,
} from "@fiftyone/state/src/selection";
import { getEventBus } from "@fiftyone/events";
import { useEffect, useState } from "react";
import {
  rememberSubsetConfirmation,
  skipSubsetConfirmation,
} from "./subsetConfirmationPreference";

/** e2e specs wait on a deletion finishing before they read the subsets */
type DeleteSubsetE2EEvents = { "e2e:subsets:deleted": undefined };

/** Owns deletion, including the browser-only opt-out and retryable failures. */
export function useDeleteSubset(
  datasetId: string,
  onDeleted: (subset: SavedSubset) => void,
) {
  const permission = useSelectionSubsetDisabledReason();
  const invalidate = useInvalidateSelectionScope(datasetId);
  const [confirming, setConfirming] = useState<SavedSubset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(0);
  // This effect tells e2e specs a deletion has finished.
  useEffect(() => {
    if (deleted)
      getEventBus<DeleteSubsetE2EEvents>().dispatch("e2e:subsets:deleted");
  }, [deleted]);

  const remove = async (subset: SavedSubset, remember = false) => {
    if (permission) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSubset(datasetId, subset.id);
      if (remember) rememberSubsetConfirmation("delete");
      invalidate();
      onDeleted(subset);
      setConfirming(null);
      setDeleted((count) => count + 1);
    } catch (cause) {
      setConfirming(subset);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return {
    disabledReason: permission,
    confirming,
    busy,
    error,
    request: (subset: SavedSubset) => {
      if (busy || permission) return;
      setError(null);
      if (skipSubsetConfirmation("delete")) void remove(subset);
      else setConfirming(subset);
    },
    confirm: (remember: boolean) => {
      if (confirming && !busy) void remove(confirming, remember);
    },
    close: () => {
      if (!busy) setConfirming(null);
    },
  };
}
