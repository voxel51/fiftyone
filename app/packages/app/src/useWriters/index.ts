/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import onSelectLabels from "./onSelectLabels";
import onSelectSamples from "./onSelectSamples";
import onSetGroupSlice from "./onSetGroupSlice";
import onSetLabelSelectionStyle from "./onSetLabelSelectionStyle";
import onSetModalFilters from "./onSetModalFilters";
import onSetSample from "./onSetSample";
import onSetSampleSelectionStyle from "./onSetSampleSelectionStyle";
import onSetSessionSpaces from "./onSetSessionSpaces";
import { REGISTERED_WRITERS } from "./registerWriter";

REGISTERED_WRITERS.modalSelector = onSetSample;
REGISTERED_WRITERS.modalFilters = onSetModalFilters;
REGISTERED_WRITERS.sessionGroupSlice = onSetGroupSlice;
REGISTERED_WRITERS.selectedLabels = onSelectLabels;
REGISTERED_WRITERS.selectedSamples = onSelectSamples;
REGISTERED_WRITERS.sampleSelectionStyle = onSetSampleSelectionStyle;
REGISTERED_WRITERS.labelSelectionStyle = onSetLabelSelectionStyle;
REGISTERED_WRITERS.sessionSpaces = onSetSessionSpaces;

export { default } from "./useWriters";
