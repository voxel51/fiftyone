import { describe, expect, it } from "vitest";
import { isFrameScopedPath, toSchemaField } from "./framePath";

describe("isFrameScopedPath", () => {
  it("scopes frames.* paths on a real video", () => {
    expect(isFrameScopedPath("frames.detections", false)).toBe(true);
    expect(isFrameScopedPath("events", false)).toBe(false);
  });

  it("scopes BARE paths on an image dynamic group played as video", () => {
    // each "frame" is its own sample, so sample-level paths are the
    // frame-scoped ones — a dynamic-attribute edit on `boxes` must engage
    // the track fan-out / forward-fill exactly like `frames.boxes` would
    expect(isFrameScopedPath("boxes", true)).toBe(true);
    expect(isFrameScopedPath("frames.detections", true)).toBe(false);
  });
});

describe("toSchemaField", () => {
  it("strips the frames prefix and passes sample-level paths through", () => {
    expect(toSchemaField("frames.detections")).toBe("detections");
    expect(toSchemaField("detections")).toBe("detections");
  });
});
