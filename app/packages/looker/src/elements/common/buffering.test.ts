import { describe, expect, it } from "vitest";
import { createBufferingIndicator } from "./buffering";

describe("createBufferingIndicator", () => {
  it("is announced as a buffering status, its icon hidden from screen readers", () => {
    const indicator = createBufferingIndicator();

    expect(indicator.getAttribute("role")).toBe("status");
    expect(indicator.getAttribute("aria-label")).toBe("Buffering");
    expect(indicator.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
