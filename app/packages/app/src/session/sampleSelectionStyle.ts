/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useSetSampleSelectionStyle from "../useEvents/useSetSampleSelectionStyle";
import onSetSampleSelectionStyle from "../useWriters/onSetSampleSelectionStyle";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "sampleSelectionStyle",
  event: "setSampleSelectionStyle",
  fromServer: useSetSampleSelectionStyle,
  onWritten: onSetSampleSelectionStyle,
});
