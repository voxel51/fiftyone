import { describe, expect, it } from "vitest";

import { temporalTagColor } from "./mcap-temporal-tag-color";

describe("temporalTagColor", () => {
  it("assigns labels deterministically across consumers", () => {
    expect(temporalTagColor("interesting")).toBe("#f97316");
    expect(temporalTagColor("interesting")).toBe(
      temporalTagColor("interesting"),
    );
  });
});
