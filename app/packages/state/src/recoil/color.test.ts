import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import * as color from "./color";

describe("temporalTagColor", () => {
  const resolver = <TestSelector<typeof color.temporalTagColor>>(
    (<unknown>color.temporalTagColor)
  );

  it("uses a configured color for a value, else the hashed fallback", () => {
    setMockAtoms({
      __colorScheme_selector: {
        temporalTags: {
          valueColors: [{ value: "pedestrian", color: "#3b82f6" }],
        },
      },
      // colorMap is a selector returning the fallback generator; the recoil
      // mock invokes this to produce the generator function.
      colorMap: () => (value: string) => `fallback:${value}`,
    });

    const colorFor = resolver();
    expect(colorFor("pedestrian")).toBe("#3b82f6");
    expect(colorFor("hard_brake")).toBe("fallback:hard_brake");
  });

  it("falls back for every value when nothing is configured", () => {
    setMockAtoms({
      __colorScheme_selector: { temporalTags: {} },
      colorMap: () => (value: string) => `fallback:${value}`,
    });

    const colorFor = resolver();
    expect(colorFor("pedestrian")).toBe("fallback:pedestrian");
    expect(colorFor("hard_brake")).toBe("fallback:hard_brake");
  });

  it("ignores color-by-field mode — always resolves by value", () => {
    setMockAtoms({
      // fieldColor set + colorBy "field" must NOT force one uniform color.
      __colorScheme_selector: {
        colorBy: "field",
        temporalTags: {
          fieldColor: "#000000",
          valueColors: [{ value: "pedestrian", color: "#3b82f6" }],
        },
      },
      colorMap: () => (value: string) => `fallback:${value}`,
    });

    const colorFor = resolver();
    expect(colorFor("pedestrian")).toBe("#3b82f6");
    expect(colorFor("hard_brake")).toBe("fallback:hard_brake");
  });
});
