/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import onSetDataset from "../useSetters/onSetDataset";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "datasetName",
  onWrite: onSetDataset,
});
