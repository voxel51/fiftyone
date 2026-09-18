/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useSelectLabels from "../useEvents/useSelectLabels";
import onSelectLabels from "../useWriters/onSelectLabels";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "selectedLabels",
  event: "selectLabels",
  fromServer: useSelectLabels,
  onWritten: onSelectLabels,
});
