import { describe, expect, it } from "vitest";
import type { StreamInventory } from "../../schemas/v1";
import { resolveMcapTimelineMode } from "./timeline-mode";

function createTopic(metadata: Record<string, string> = {}): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    displayName: "/topic",
    metadata,
    payload: {
      $typeName: "fiftyone.multimodal.schemas.v1.PayloadDescriptor",
      encoding: "protobuf",
      schema: "foxglove.CompressedImage",
      schemaEncoding: "protobuf",
    },
    streamId: "/topic",
  };
}

describe("resolveMcapTimelineMode", () => {
  it("defaults to duration mode when no topic declares timeline_mode", () => {
    expect(resolveMcapTimelineMode([createTopic(), createTopic()])).toEqual({
      kind: "duration",
    });
  });

  it("defaults to duration mode for an empty topic list", () => {
    expect(resolveMcapTimelineMode([])).toEqual({ kind: "duration" });
  });

  it("resolves sequence mode with the declared fps", () => {
    const topics = [
      createTopic(),
      createTopic({
        "mcap.channel_metadata.timeline_mode": "sequence",
        "mcap.channel_metadata.timeline_fps": "12",
      }),
    ];
    expect(resolveMcapTimelineMode(topics)).toEqual({
      kind: "sequence",
      fps: 12,
    });
  });

  it("falls back to duration when sequence mode's fps is missing or invalid", () => {
    const missingFps = [
      createTopic({ "mcap.channel_metadata.timeline_mode": "sequence" }),
    ];
    expect(resolveMcapTimelineMode(missingFps)).toEqual({ kind: "duration" });

    const zeroFps = [
      createTopic({
        "mcap.channel_metadata.timeline_mode": "sequence",
        "mcap.channel_metadata.timeline_fps": "0",
      }),
    ];
    expect(resolveMcapTimelineMode(zeroFps)).toEqual({ kind: "duration" });

    const nonNumericFps = [
      createTopic({
        "mcap.channel_metadata.timeline_mode": "sequence",
        "mcap.channel_metadata.timeline_fps": "not-a-number",
      }),
    ];
    expect(resolveMcapTimelineMode(nonNumericFps)).toEqual({
      kind: "duration",
    });
  });

  it("resolves absolute mode's epoch anchor from an explicit override", () => {
    const topics = [
      createTopic({
        "mcap.channel_metadata.timeline_mode": "absolute",
        "mcap.channel_metadata.timeline_epoch_anchor_ms": "1700000000000",
      }),
    ];
    expect(resolveMcapTimelineMode(topics)).toEqual({
      kind: "absolute",
      epochAnchorMs: 1700000000000,
    });
  });

  it("derives absolute mode's epoch anchor from the scene start time when no override is given", () => {
    const topics = [
      createTopic({
        "mcap.channel_metadata.timeline_mode": "absolute",
        "mcap.scene_start_time_ns": "1700000000000000000",
      }),
    ];
    expect(resolveMcapTimelineMode(topics)).toEqual({
      kind: "absolute",
      epochAnchorMs: 1700000000000,
    });
  });

  it("defaults absolute mode's epoch anchor to 0 when neither is present", () => {
    const topics = [
      createTopic({ "mcap.channel_metadata.timeline_mode": "absolute" }),
    ];
    expect(resolveMcapTimelineMode(topics)).toEqual({
      kind: "absolute",
      epochAnchorMs: 0,
    });
  });

  it("uses the first topic that declares a timeline_mode", () => {
    const topics = [
      createTopic(),
      createTopic({
        "mcap.channel_metadata.timeline_mode": "sequence",
        "mcap.channel_metadata.timeline_fps": "24",
      }),
      createTopic({
        "mcap.channel_metadata.timeline_mode": "absolute",
      }),
    ];
    expect(resolveMcapTimelineMode(topics)).toEqual({
      kind: "sequence",
      fps: 24,
    });
  });

  it("falls back to duration for an unrecognized timeline_mode value", () => {
    const topics = [
      createTopic({ "mcap.channel_metadata.timeline_mode": "bogus" }),
    ];
    expect(resolveMcapTimelineMode(topics)).toEqual({ kind: "duration" });
  });
});
