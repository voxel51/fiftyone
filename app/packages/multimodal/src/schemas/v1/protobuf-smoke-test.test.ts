import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { SceneInventorySchema } from ".";

// Smoke test that generated TypeScript bindings are importable and usable.
describe("integrity of generated contracts", () => {
  it("imports and round-trips a generated message", () => {
    const scene = create(SceneInventorySchema, {
      sceneId: "scene-1",
      sourceFormat: "mcap",
      inventoryVersion: "v1",
      producedAt: "2026-01-01T00:00:00Z",
      producedBy: "smoke-test",
    });

    const roundTrip = fromBinary(
      SceneInventorySchema,
      toBinary(SceneInventorySchema, scene)
    );

    expect(roundTrip.sceneId).toBe("scene-1");
  });
});
