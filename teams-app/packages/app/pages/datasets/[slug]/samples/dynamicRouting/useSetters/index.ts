import onRefresh from "./onRefresh";
import onSetColorScheme from "./onSetColorScheme";
import onSetDataset from "./onSetDataset";
import onSetFieldVisibilityStage from "./onSetFieldVisibilityStage";
import onSetGroupSlice from "./onSetGroupSlice";
import onSetSimilarityParameters from "./onSetSimilarityParameters";
import onSetView from "./onSetView";
import onSetViewName from "./onSetViewName";
import registerSetter from "./registerSetter";

registerSetter("colorScheme", onSetColorScheme);
registerSetter("datasetName", onSetDataset);
registerSetter("fieldVisibilityStage", onSetFieldVisibilityStage);
registerSetter("groupSlice", onSetGroupSlice);
registerSetter("refresh", onRefresh);
registerSetter("similarityParameters", onSetSimilarityParameters);
registerSetter("view", onSetView);
registerSetter("viewName", onSetViewName);

export { default } from "./useSetters";
