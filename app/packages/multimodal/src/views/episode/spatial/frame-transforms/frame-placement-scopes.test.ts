import { describe, expect, it } from "vitest";
import {
  FramePlacementScopeRegistry,
  normalizePlacementScope,
  normalizedPlacementScopes,
} from "./frame-placement-scopes";

describe("frame placement scopes", () => {
  it("normalizes frame ids and removes the target from the source set", () => {
    expect(
      normalizePlacementScope({
        frameIds: [" lidar ", "map", "", "lidar"],
        targetFrameId: " map ",
      }),
    ).toEqual({ frameIds: ["lidar"], targetFrameId: "map" });
    expect(
      normalizePlacementScope({ frameIds: ["map"], targetFrameId: "map" }),
    ).toBeNull();
  });

  it("deduplicates semantically equal scopes", () => {
    expect(
      normalizedPlacementScopes([
        { frameIds: ["camera", "lidar"], targetFrameId: "map" },
        { frameIds: ["lidar", "camera"], targetFrameId: "map" },
      ]),
    ).toEqual([{ frameIds: ["camera", "lidar"], targetFrameId: "map" }]);
  });

  it("disposes registrations idempotently and retains other scopes", () => {
    const registry = new FramePlacementScopeRegistry();
    const disposeCamera = registry.register({
      frameIds: ["camera"],
      targetFrameId: "map",
    });
    registry.register({ frameIds: ["lidar"], targetFrameId: "map" });

    expect(registry.values()).toEqual([
      { frameIds: ["camera"], targetFrameId: "map" },
      { frameIds: ["lidar"], targetFrameId: "map" },
    ]);
    expect(disposeCamera?.()).toBe(true);
    expect(disposeCamera?.()).toBe(false);
    expect(registry.values()).toEqual([
      { frameIds: ["lidar"], targetFrameId: "map" },
    ]);
  });
});
