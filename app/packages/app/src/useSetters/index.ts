/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import onRefresh from "./onRefresh";
import onSetDataset from "./onSetDataset";
import onSetFieldVisibilityStage from "./onSetFieldVisibilityStage";
import onSetSimilarityParameters from "./onSetSimilarityParameters";
import onSetView from "./onSetView";
import onSetViewName from "./onSetViewName";
import "../session";
import registerSetter from "./registerSetter";

registerSetter("datasetName", onSetDataset);
registerSetter("fieldVisibilityStage", onSetFieldVisibilityStage);
registerSetter("refresh", onRefresh);
registerSetter("similarityParameters", onSetSimilarityParameters);
registerSetter("view", onSetView);
registerSetter("viewName", onSetViewName);

export { default } from "./useSetters";
