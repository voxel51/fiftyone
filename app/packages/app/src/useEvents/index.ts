import { useSetSelectedLabels, useSetSpaces } from "@fiftyone/state";
import registerEvent from "./registerEvent";
import useDeactivateNotebookCell from "./useDeactivateNotebookCell";
import useRefresh from "./useRefresh";
import useSetColorScheme from "./useSetColorScheme";
import useSetSelectedSamples from "./useSetSelectedSamples";
import useStateUpdate from "./useStateUpdate";

registerEvent("setColorScheme", useSetColorScheme);
registerEvent("deactivateNotebookCell", useDeactivateNotebookCell);
registerEvent("refresh", useRefresh);
registerEvent("setSelectedLabels", useSetSelectedLabels);
registerEvent("setSelectedSamples", useSetSelectedSamples);
registerEvent("setSpaces", useSetSpaces);
registerEvent("stateUpdate", useStateUpdate);

export { default } from "./useEvents";
