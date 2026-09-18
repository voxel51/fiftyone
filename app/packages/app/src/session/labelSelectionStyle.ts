/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useSetLabelSelectionStyle from "../useEvents/useSetLabelSelectionStyle";
import onSetLabelSelectionStyle from "../useWriters/onSetLabelSelectionStyle";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "labelSelectionStyle",
  event: "setLabelSelectionStyle",
  fromServer: useSetLabelSelectionStyle,
  onWritten: onSetLabelSelectionStyle,
});
