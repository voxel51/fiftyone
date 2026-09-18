/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import onSetView from "../useSetters/onSetView";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "view",
  onWrite: onSetView,
});
