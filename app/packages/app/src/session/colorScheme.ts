/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import onSetColorScheme from "../useSetters/onSetColorScheme";
import useSetColorScheme from "../useEvents/useSetColorScheme";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "colorScheme",
  event: "setColorScheme",
  fromServer: useSetColorScheme,
  onWrite: onSetColorScheme,
});
