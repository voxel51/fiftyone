import registerEvent from "./registerEvent";
import useDeactivateNotebookCell from "./useDeactivateNotebookCell";
import useRefresh from "./useRefresh";
import useSelectLabels from "./useSelectLabels";
import useSetSelectedSamples from "./useSelectSamples";
import useSetColorScheme from "./useSetColorScheme";
import useSetSpaces from "./useSetSpaces";
import useStateUpdate from "./useStateUpdate";

registerEvent("deactivateNotebookCell", useDeactivateNotebookCell);
registerEvent("refresh", useRefresh);
registerEvent("selectLabels", useSelectLabels);
registerEvent("selectSamples", useSetSelectedSamples);
registerEvent("setColorScheme", useSetColorScheme);
registerEvent("setSpaces", useSetSpaces);
registerEvent("stateUpdate", useStateUpdate);

export { default } from "./useEvents";
