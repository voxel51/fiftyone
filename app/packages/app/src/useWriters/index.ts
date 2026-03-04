import onSelectLabels from "./onSelectLabels";
import onSelectMeta from "./onSelectMeta";
import onSelectSamples from "./onSelectSamples";
import onSetGroupSlice from "./onSetGroupSlice";
import onSetModalFilters from "./onSetModalFilters";
import onSetSample from "./onSetSample";
import onSetSelectionStyle from "./onSetSelectionStyle";
import onSetSessionSpaces from "./onSetSessionSpaces";
import { REGISTERED_WRITERS } from "./registerWriter";

REGISTERED_WRITERS.modalSelector = onSetSample;
REGISTERED_WRITERS.modalFilters = onSetModalFilters;
REGISTERED_WRITERS.sessionGroupSlice = onSetGroupSlice;
REGISTERED_WRITERS.selectedLabels = onSelectLabels;
REGISTERED_WRITERS.selectedSamples = onSelectSamples;
REGISTERED_WRITERS.selectedMeta = onSelectMeta;
REGISTERED_WRITERS.selectionStyle = onSetSelectionStyle;
REGISTERED_WRITERS.sessionSpaces = onSetSessionSpaces;

export { default } from "./useWriters";
