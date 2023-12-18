import onSelectLabels from "./onSelectLabels";
import onSelectSamples from "./onSelectSamples";
import onSetGroupSlice from "./onSetGroupSlice";
import onSetSessionSpaces from "./onSetSessionSpaces";
import { REGISTERED_WRITERS } from "./registerWriter";

REGISTERED_WRITERS["sessionGroupSlice"] = onSetGroupSlice;
REGISTERED_WRITERS["selectedLabels"] = onSelectLabels;
REGISTERED_WRITERS["selectedSamples"] = onSelectSamples;
REGISTERED_WRITERS["sessionSpaces"] = onSetSessionSpaces;

export { default } from "./useWriters";
