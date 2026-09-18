/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import onSetViewName from "../useSetters/onSetViewName";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "viewName",
  onWrite: onSetViewName,
});
