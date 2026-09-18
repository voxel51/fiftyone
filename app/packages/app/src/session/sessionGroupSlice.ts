/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useSetGroupSlice from "../useEvents/useSetGroupSlice";
import onSetGroupSlice from "../useWriters/onSetGroupSlice";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "sessionGroupSlice",
  event: "setGroupSlice",
  fromServer: useSetGroupSlice,
  onWritten: onSetGroupSlice,
});
