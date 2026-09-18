/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import onSetModalFilters from "../useWriters/onSetModalFilters";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "modalFilters",
  onWritten: onSetModalFilters,
});
