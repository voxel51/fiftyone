import { describe, expect, it } from "vitest";

import { instanceIdFromTrackId } from "./trackIdentity";

describe("instanceIdFromTrackId", () => {
  it("strips the instance- prefix to the engine instanceId", () => {
    expect(instanceIdFromTrackId("instance-abc123")).toBe("abc123");
  });

  it("returns a bare document id unchanged (untracked detection)", () => {
    expect(instanceIdFromTrackId("65f0a1b2c3d4e5f6a7b8c9d0")).toBe(
      "65f0a1b2c3d4e5f6a7b8c9d0",
    );
  });

  it("returns null for a legacy index-only track (no engine identity)", () => {
    expect(instanceIdFromTrackId("track-4")).toBeNull();
  });
});
