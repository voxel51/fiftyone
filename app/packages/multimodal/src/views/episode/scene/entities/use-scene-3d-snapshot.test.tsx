import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  useScene3dSnapshot,
  type Scene3dSnapshot,
} from "./use-scene-3d-snapshot";

describe("useScene3dSnapshot", () => {
  it("retains the committed scene while the same source is pending", () => {
    const ready = snapshot([{ id: "cloud" }] as never);
    const empty = snapshot([]);
    const { result, rerender } = renderHook<
      ReturnType<typeof useScene3dSnapshot>,
      { current: Scene3dSnapshot; readiness: "pending" | "ready" }
    >(
      ({ current, readiness }) =>
        useScene3dSnapshot({
          current,
          hasSourceData: true,
          key: "source:selection:world",
          readiness,
        }),
      { initialProps: { current: ready, readiness: "ready" as const } },
    );

    expect(result.current.snapshot).toBe(ready);
    rerender({ current: empty, readiness: "pending" as const });
    expect(result.current.snapshot).toBe(ready);
    expect(result.current.heldReason).toBe("pending");
  });
});

function snapshot(
  pointCloudLayers: Scene3dSnapshot["pointCloudLayers"],
): Scene3dSnapshot {
  return {
    annotationLayers: [],
    frustumLayers: [],
    gridLayers: [],
    notices: [],
    placementStatus: pointCloudLayers.length > 0 ? "transformed" : "empty",
    pointCloudLayers,
  };
}
