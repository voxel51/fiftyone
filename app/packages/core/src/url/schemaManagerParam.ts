/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { defineParam } from "@fiftyone/location";

export const SCHEMA_MANAGER_QUERY_PARAM = "schemaManager";
export const SCHEMA_MANAGER_QUERY_VALUE = "open";

export const schemaManagerParam = defineParam<boolean>({
  key: SCHEMA_MANAGER_QUERY_PARAM,
  parse: (raw) => raw === SCHEMA_MANAGER_QUERY_VALUE,
  format: (open) => (open ? SCHEMA_MANAGER_QUERY_VALUE : undefined),
  history: "replace",
  scope: "dataset",
});
