/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { SaveHealth, deriveSaveHealth } from "./saveStatus";

describe("deriveSaveHealth", () => {
  it("is healthy when attempts are allowed and not unhealthy", () => {
    expect(deriveSaveHealth({ canAttempt: true, isUnhealthy: false })).toBe(
      SaveHealth.Healthy,
    );
  });

  it("is unhealthy when flagged but retries remain", () => {
    expect(deriveSaveHealth({ canAttempt: true, isUnhealthy: true })).toBe(
      SaveHealth.Unhealthy,
    );
  });

  it("is stopped once attempts are exhausted, regardless of the unhealthy flag", () => {
    expect(deriveSaveHealth({ canAttempt: false, isUnhealthy: true })).toBe(
      SaveHealth.Stopped,
    );
    expect(deriveSaveHealth({ canAttempt: false, isUnhealthy: false })).toBe(
      SaveHealth.Stopped,
    );
  });
});
