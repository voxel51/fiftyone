/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useSetSelectedSamples from "../useEvents/useSelectSamples";
import onSelectSamples from "../useWriters/onSelectSamples";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "selectedSamples",
  event: "selectSamples",
  fromServer: useSetSelectedSamples,
  onWritten: onSelectSamples,
});
