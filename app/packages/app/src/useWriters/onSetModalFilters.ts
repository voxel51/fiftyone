/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { RegisteredWriter } from "./registerWriter";

const onSetModalFilters: RegisteredWriter<"modalFilters"> = () => () => {
  // TODO: OSS is a noop
};

export default onSetModalFilters;
