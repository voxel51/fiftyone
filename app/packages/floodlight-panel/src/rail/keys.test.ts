import { describe, expect, it } from "vitest";
import { keyTarget } from "./keys";

describe("keyTarget", () => {
  it("steps along a vertical rail", () => {
    expect(keyTarget("ArrowDown", 0.5, "vertical")).toBe(0.51);
    expect(keyTarget("ArrowUp", 0.5, "vertical")).toBe(0.49);
    expect(keyTarget("ArrowRight", 0.5, "vertical")).toBe(undefined);
  });

  it("steps along a horizontal rail", () => {
    expect(keyTarget("ArrowRight", 0.5, "horizontal")).toBe(0.51);
    expect(keyTarget("ArrowLeft", 0.5, "horizontal")).toBe(0.49);
    expect(keyTarget("ArrowDown", 0.5, "horizontal")).toBe(undefined);
  });

  it("pages and jumps to the ends in either orientation", () => {
    expect(keyTarget("PageDown", 0.5, "horizontal")).toBe(0.6);
    expect(keyTarget("PageUp", 0.5, "vertical")).toBe(0.4);
    expect(keyTarget("Home", 0.5, "vertical")).toBe(0);
    expect(keyTarget("End", 0.5, "horizontal")).toBe(1);
  });

  it("clamps at the ends", () => {
    expect(keyTarget("PageDown", 0.95, "vertical")).toBe(1);
    expect(keyTarget("ArrowLeft", 0.005, "horizontal")).toBe(0);
    expect(keyTarget("Tab", 0.5, "vertical")).toBe(undefined);
  });
});
