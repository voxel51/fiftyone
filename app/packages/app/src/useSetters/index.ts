import onSetGroupSlice from "./onSetGroupSlice";
import onSetRefreshPage from "./onSetRefreshPage";
import onSetView from "./onSetView";
import onSetViewName from "./onSetViewName";
import registerSetter from "./registerSetter";

registerSetter("groupSlice", onSetGroupSlice);
registerSetter("refreshPage", onSetRefreshPage);
registerSetter("view", onSetView);
registerSetter("viewName", onSetViewName);

export { default } from "./useSetters";
