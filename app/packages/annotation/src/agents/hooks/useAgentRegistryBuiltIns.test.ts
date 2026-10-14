/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Named for the built-ins rather than the hook: `fiftyone-teams` carries its
 * own `useAgentRegistry.test.ts` (covering `register`), which OSS does not
 * have, and two unrelated files at one path are an add/add conflict on every
 * enterprise sync.
 *
 * The registry's built-in entries. The invariant worth pinning is which agents
 * a user can PICK: propagation agents are resolved programmatically from a
 * track's label type (see `useVideoPropagate`), so they must never reach the
 * "Select annotation model" dropdown, which lists everything not `unlisted`.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAgentRegistry } from "./useAgentRegistry";

const builtIns = async () => {
  const { result } = renderHook(() => useAgentRegistry());
  return result.current.listAgents();
};

describe("useAgentRegistry built-ins", () => {
  it("keeps every propagation agent out of the model picker", async () => {
    // Regression: `propagate-linear-polyline` shipped without `unlisted`, so
    // "Linear interpolation (polyline)" appeared alongside the SAM2 models as
    // if it were an annotation model the user could run.
    const propagation = (await builtIns()).filter((a) =>
      a.id.startsWith("propagate-"),
    );

    expect(propagation.length).toBeGreaterThan(0);
    for (const descriptor of propagation) {
      expect(
        descriptor.unlisted,
        `${descriptor.id} ("${descriptor.label}") would show in the picker`,
      ).toBe(true);
    }
  });

  it("still offers the annotation models", async () => {
    const listed = (await builtIns()).filter((a) => !a.unlisted);

    expect(listed.map((a) => a.id)).toEqual(["sam2-tiny-onnx"]);
  });
});
