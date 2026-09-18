/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useSetSpaces from "../useEvents/useSetSpaces";
import onSetSessionSpaces from "../useWriters/onSetSessionSpaces";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "sessionSpaces",
  event: "setSpaces",
  fromServer: useSetSpaces,
  onWritten: onSetSessionSpaces,
});
