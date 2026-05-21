/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { RegisteredSetter } from "./registerSetter";

const onRefresh: RegisteredSetter =
  ({ router }) =>
  () => {
    router.load(true);
  };

export default onRefresh;
