/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import onSetSimilarityParameters from "../useSetters/onSetSimilarityParameters";
import { defineSessionKey } from "./defineSessionKey";

export default defineSessionKey({
  key: "similarityParameters",
  onWrite: onSetSimilarityParameters,
});
