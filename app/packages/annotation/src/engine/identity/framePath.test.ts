import { describe, expect, it } from "vitest";

import { toSchemaField } from "./framePath";

describe("framePath", () => {
  it("strips the frame prefix to recover the in-frame-doc field", () => {
    expect(toSchemaField("frames.detections")).toBe("detections");
  });

  it("leaves a sample-level path unchanged", () => {
    expect(toSchemaField("events")).toBe("events");
  });
});
