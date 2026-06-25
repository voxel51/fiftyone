import type { ModalSample } from "@fiftyone/state";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAnnotatePrerequisites } from "./useAnnotatePrerequisites";

const sampleWith = (
  frameRate: unknown,
  metadata: Record<string, unknown>
): ModalSample =>
  ({ frameRate, sample: { metadata } } as unknown as ModalSample);

describe("useAnnotatePrerequisites", () => {
  it("resolves frameRate + frameCount when metadata is present", () => {
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(30, { total_frame_count: 90 }))
    );

    expect(result.current).toEqual({
      ok: true,
      frameRate: 30,
      frameCount: 90,
    });
  });

  it("blocks on metadata when frameRate is missing", () => {
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(undefined, { total_frame_count: 90 }))
    );

    expect(result.current).toEqual({ ok: false, blocker: "metadata" });
  });

  it("blocks on metadata when frame count is unresolvable", () => {
    const { result } = renderHook(() =>
      useAnnotatePrerequisites(sampleWith(30, {}))
    );

    expect(result.current).toEqual({ ok: false, blocker: "metadata" });
  });
});
