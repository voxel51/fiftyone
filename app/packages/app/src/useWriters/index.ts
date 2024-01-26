import onSelectLabels from "./onSelectLabels";
import onSelectSamples from "./onSelectSamples";
import onSetGroupSlice from "./onSetGroupSlice";
import onSetPage from "./onSetPage";
import onSetSessionSpaces from "./onSetSessionSpaces";
import { REGISTERED_WRITERS } from "./registerWriter";

REGISTERED_WRITERS["sessionGroupSlice"] = onSetGroupSlice;
REGISTERED_WRITERS["selectedLabels"] = onSelectLabels;
REGISTERED_WRITERS["selectedSamples"] = onSelectSamples;
REGISTERED_WRITERS["sessionSpaces"] = onSetSessionSpaces;
REGISTERED_WRITERS["sessionPage"] = onSetPage;

export { default } from "./useWriters";
