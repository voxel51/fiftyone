import {
  useGridSelectionDataset,
  useLoadGridSelection,
} from "@fiftyone/state/src/selection";
import SelectionTray from "./SelectionTray";

/** Keeps saved references reachable after every source episode has been removed. */
export function EmptyDatasetSelection() {
  useLoadGridSelection();
  const { enabled, datasetId } = useGridSelectionDataset();
  return enabled ? <SelectionTray key={datasetId} /> : null;
}
