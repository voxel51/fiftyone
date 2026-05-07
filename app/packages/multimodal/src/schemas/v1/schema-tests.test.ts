import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  PlaybackPlanSchema,
  SceneInventorySchema,
  TimeTrackRole,
  TimeTrackSchema,
  TimeTrackType,
} from ".";

// Smoke tests that generated TypeScript bindings are importable and usable.
// Each test round-trips one representative message from one source proto file.
describe("integrity of generated contracts", () => {
  it("round-trips one common.proto message", () => {
    // common.proto: TimeTrack
    const track = create(TimeTrackSchema, {
      timeTrackId: "sample.index",
      type: TimeTrackType.SEQUENCE,
      role: TimeTrackRole.SAMPLE_INDEX,
      displayName: "Sample index",
      valueRange: {
        start: "0",
        end: "1",
      },
    });

    const roundTrip = fromBinary(
      TimeTrackSchema,
      toBinary(TimeTrackSchema, track)
    );

    expect(roundTrip.timeTrackId).toBe("sample.index");
  });

  it("round-trips one inventory.proto message", () => {
    // inventory.proto: SceneInventory
    const scene = create(SceneInventorySchema, {
      inventoryId: "inventory-1",
      sceneId: "scene-1",
      sourceFormat: "mcap",
      inventoryVersion: "v1",
    });

    const roundTrip = fromBinary(
      SceneInventorySchema,
      toBinary(SceneInventorySchema, scene)
    );

    expect(roundTrip.inventoryId).toBe("inventory-1");
  });

  it("round-trips one playback.proto message", () => {
    // playback.proto: PlaybackPlan
    const plan = create(PlaybackPlanSchema, {
      planId: "plan-1",
      sceneId: "scene-1",
      sourceInventoryId: "inventory-1",
    });

    const roundTrip = fromBinary(
      PlaybackPlanSchema,
      toBinary(PlaybackPlanSchema, plan)
    );

    expect(roundTrip.sourceInventoryId).toBe("inventory-1");
  });
});
