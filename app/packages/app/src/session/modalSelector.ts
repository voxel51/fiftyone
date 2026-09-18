/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useSetSample from "../useEvents/useSetSample";
import onSetSample from "../useWriters/onSetSample";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "modalSelector",
  event: "setSample",
  fromServer: useSetSample,
  onWritten: onSetSample,
});
