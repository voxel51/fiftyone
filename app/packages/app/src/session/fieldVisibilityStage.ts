/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useSetFieldVisibilityStage from "../useEvents/useSetFieldVisibilityStage";
import onSetFieldVisibilityStage from "../useSetters/onSetFieldVisibilityStage";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "fieldVisibilityStage",
  event: "setFieldVisibilityStage",
  fromServer: useSetFieldVisibilityStage,
  onWrite: onSetFieldVisibilityStage,
});
