/**
 * Panel controller: the runs page is the landing view; opening a run
 * shows the plot. `openKey` is panel state (local) so the choice
 * survives the remounts that view changes cause, per panel instance.
 */
import { usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import PlotView from "./PlotView";
import RunsList from "./RunsList";
import { useVisualizationRuns } from "./useVisualizationRuns";

export default function EmbeddingsV2Panel() {
  const datasetName = useRecoilValue(fos.datasetName) ?? null;
  const [openKeyState, setOpenKey] = usePanelStatePartial<string | null>(
    "openKey",
    null,
    true,
  );
  const openKey = openKeyState ?? null;

  const { runs, error } = useVisualizationRuns(datasetName);
  // A stale key (deleted run, switched dataset) falls back to the list
  const openRun = runs?.find((r) => r.brainKey === openKey) ?? null;

  if (openRun) {
    return (
      <PlotView
        datasetName={datasetName}
        run={openRun}
        onBack={() => setOpenKey(null)}
      />
    );
  }
  return <RunsList runs={runs} error={error} onOpen={setOpenKey} />;
}
