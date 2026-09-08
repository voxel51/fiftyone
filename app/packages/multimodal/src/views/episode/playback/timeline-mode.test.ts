import { describe, expect, it } from "vitest";
import type { StreamDescriptor } from "../../../ir";
import { resolveTimelineMode } from "./timeline-mode";

function createStream(metadata: Record<string, string> = {}): StreamDescriptor {
  return {
    id: "/topic",
    kind: "image",
    metadata,
    payload: {
      encoding: "protobuf",
      schema: "foxglove.CompressedImage",
      schemaEncoding: "protobuf",
    },
    sourceName: "/topic",
    timeRange: { endNs: 1n, startNs: 0n },
  };
}

describe("resolveTimelineMode", () => {
  it("defaults to duration mode when no stream declares timeline_mode", () => {
    expect(resolveTimelineMode([createStream(), createStream()])).toEqual({
      kind: "duration",
    });
  });

  it("defaults to duration mode for an empty stream list", () => {
    expect(resolveTimelineMode([])).toEqual({ kind: "duration" });
  });

  it("resolves sequence mode with the declared fps", () => {
    const streams = [
      createStream(),
      createStream({
        "mcap.channel_metadata.timeline_mode": "sequence",
        "mcap.channel_metadata.timeline_fps": "12",
      }),
    ];
    expect(resolveTimelineMode(streams)).toEqual({
      kind: "sequence",
      fps: 12,
    });
  });

  it("falls back to duration when sequence mode's fps is missing or invalid", () => {
    const missingFps = [
      createStream({ "mcap.channel_metadata.timeline_mode": "sequence" }),
    ];
    expect(resolveTimelineMode(missingFps)).toEqual({
      kind: "duration",
    });

    const zeroFps = [
      createStream({
        "mcap.channel_metadata.timeline_mode": "sequence",
        "mcap.channel_metadata.timeline_fps": "0",
      }),
    ];
    expect(resolveTimelineMode(zeroFps)).toEqual({ kind: "duration" });

    const nonNumericFps = [
      createStream({
        "mcap.channel_metadata.timeline_mode": "sequence",
        "mcap.channel_metadata.timeline_fps": "not-a-number",
      }),
    ];
    expect(resolveTimelineMode(nonNumericFps)).toEqual({
      kind: "duration",
    });
  });

  it("resolves absolute mode's epoch anchor from an explicit override", () => {
    const streams = [
      createStream({
        "mcap.channel_metadata.timeline_mode": "absolute",
        "mcap.channel_metadata.timeline_epoch_anchor_ms": "1700000000000",
      }),
    ];
    expect(resolveTimelineMode(streams)).toEqual({
      kind: "absolute",
      epochAnchorMs: 1700000000000,
    });
  });

  it("derives absolute mode's epoch anchor from the episode start time", () => {
    const streams = [
      createStream({
        "mcap.channel_metadata.timeline_mode": "absolute",
        "mcap.scene_start_time_ns": "1700000000000000000",
      }),
    ];
    expect(resolveTimelineMode(streams)).toEqual({
      kind: "absolute",
      epochAnchorMs: 1700000000000,
    });
  });

  it("falls back to duration when scene_start_time_ns is malformed", () => {
    const streams = [
      createStream({
        "mcap.channel_metadata.timeline_mode": "absolute",
        "mcap.scene_start_time_ns": "not-an-integer",
      }),
    ];
    expect(resolveTimelineMode(streams)).toEqual({ kind: "duration" });
  });

  it("defaults absolute mode's epoch anchor to 0 when neither is present", () => {
    const streams = [
      createStream({ "mcap.channel_metadata.timeline_mode": "absolute" }),
    ];
    expect(resolveTimelineMode(streams)).toEqual({
      kind: "absolute",
      epochAnchorMs: 0,
    });
  });

  it("uses the first stream that declares a timeline_mode", () => {
    const streams = [
      createStream(),
      createStream({
        "mcap.channel_metadata.timeline_mode": "sequence",
        "mcap.channel_metadata.timeline_fps": "24",
      }),
      createStream({ "mcap.channel_metadata.timeline_mode": "absolute" }),
    ];
    expect(resolveTimelineMode(streams)).toEqual({
      kind: "sequence",
      fps: 24,
    });
  });

  it("falls back to duration for an unrecognized timeline_mode value", () => {
    const streams = [
      createStream({ "mcap.channel_metadata.timeline_mode": "bogus" }),
    ];
    expect(resolveTimelineMode(streams)).toEqual({ kind: "duration" });
  });
});
