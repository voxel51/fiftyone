/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { looksDemuxable } from "./nativeDecodeSupport";

describe("looksDemuxable", () => {
  it("accepts MP4/MOV extensions", () => {
    expect(looksDemuxable("/media/clip.mp4")).toBe(true);
    expect(looksDemuxable("/media/clip.mov")).toBe(true);
    expect(looksDemuxable("/media/clip.m4v")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(looksDemuxable("/media/CLIP.MP4")).toBe(true);
    expect(looksDemuxable("/media/CLIP.WEBM")).toBe(false);
  });

  it("rejects known non-ISO-BMFF containers", () => {
    expect(looksDemuxable("/media/clip.webm")).toBe(false);
    expect(looksDemuxable("/media/clip.mkv")).toBe(false);
    expect(looksDemuxable("/media/clip.avi")).toBe(false);
  });

  it("ignores query strings and fragments (presigned URLs)", () => {
    expect(looksDemuxable("https://x/clip.mp4?sig=abc&exp=1")).toBe(true);
    expect(looksDemuxable("https://x/clip.webm?sig=abc")).toBe(false);
    expect(looksDemuxable("https://x/clip.mp4#t=1")).toBe(true);
  });

  it("permits an absent extension (let the probe decide)", () => {
    expect(looksDemuxable("https://x/presigned-object-id")).toBe(true);
    expect(looksDemuxable("https://x/media/")).toBe(true);
  });

  it("does not treat a dotted directory as an extension", () => {
    expect(looksDemuxable("https://x/v1.2/object")).toBe(true);
  });
});
