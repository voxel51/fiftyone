import {
  useGridSelectionDataset,
  useLoadGridSelection,
  useSyncSelectionScope,
} from "@fiftyone/state/src/selection";
import { useSubsetScopeUrl } from "./useSubsetScopeUrl";
import SelectionTray from "./SelectionTray";

/** Keeps saved references reachable after every source episode has been removed. */
export function EmptyDatasetSelection() {
  useLoadGridSelection();
  useSubsetScopeUrl();
  useSyncSelectionScope();
  const { enabled, datasetId } = useGridSelectionDataset();
  return enabled ? <SelectionTray key={datasetId} /> : null;
}
