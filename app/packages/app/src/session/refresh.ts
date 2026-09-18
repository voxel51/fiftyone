/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useRefresh from "../useEvents/useRefresh";
import onRefresh from "../useSetters/onRefresh";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "refresh",
  event: "refresh",
  fromServer: useRefresh,
  onWrite: onRefresh,
});
