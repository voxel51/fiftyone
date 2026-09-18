/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import "../session";
import registerEvent from "./registerEvent";
import useAppCountUpdate from "./useAppCountUpdate";
import useDeactivateNotebookCell from "./useDeactivateNotebookCell";
import useStateUpdate from "./useStateUpdate";

registerEvent("appCountUpdate", useAppCountUpdate);
registerEvent("deactivateNotebookCell", useDeactivateNotebookCell);
registerEvent("stateUpdate", useStateUpdate);

export { default } from "./useEvents";
