/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, it } from "vitest";
import { CONFORMANCE_CASES } from "./conformance";
import { memoryHarness } from "./harness";

describe("memory adapter conformance", () => {
  for (const { name, run } of CONFORMANCE_CASES) {
    it(name, () => run(memoryHarness()));
  }
});
