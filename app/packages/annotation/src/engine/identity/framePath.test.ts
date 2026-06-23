import { describe, expect, it } from "vitest";

import { toFrameEnginePath, toSchemaField } from "./framePath";

describe("framePath seam", () => {
  it("maps a relative field to the frame engine path", () => {
    expect(toFrameEnginePath("detections")).toBe("frames.detections");
  });

  it("is idempotent — an already-prefixed path is unchanged", () => {
    expect(toFrameEnginePath("frames.detections")).toBe("frames.detections");
  });

  it("strips the frame prefix to recover the schema field", () => {
    expect(toSchemaField("frames.detections")).toBe("detections");
  });

  it("leaves a sample-level path unchanged in both directions", () => {
    expect(toSchemaField("events")).toBe("events");
    expect(toSchemaField(toFrameEnginePath("detections"))).toBe("detections");
  });
});
