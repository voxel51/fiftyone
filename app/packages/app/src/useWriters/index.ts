import onSelectLabels from "./onSelectLabels";
import onSelectSamples from "./onSelectSamples";
import onSetColorScheme from "./onSetColorScheme";
import onSetGroupSlice from "./onSetGroupSlice";
import onSetSelectedFields from "./onSetSelectedFields";
import onSetSessionSpaces from "./onSetSessionSpaces";
import onSetFieldVisibility from "./onSetFieldVisibility";
import { REGISTERED_WRITERS } from "./registerWriter";

REGISTERED_WRITERS["colorScheme"] = onSetColorScheme;
REGISTERED_WRITERS["sessionGroupSlice"] = onSetGroupSlice;
REGISTERED_WRITERS["selectedLabels"] = onSelectLabels;
REGISTERED_WRITERS["selectedSamples"] = onSelectSamples;
REGISTERED_WRITERS["selectedFields"] = onSetSelectedFields;
REGISTERED_WRITERS["sessionSpaces"] = onSetSessionSpaces;
REGISTERED_WRITERS["fieldVisibilityState"] = onSetFieldVisibility;

export { default } from "./useWriters";
