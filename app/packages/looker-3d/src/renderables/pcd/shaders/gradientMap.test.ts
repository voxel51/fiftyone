import { describe, expect, it } from "vitest";
import { getGradientFromSchemeName } from "./gradientMap";

describe("getGradientFromSchemeName", () => {
  it("should generate correct number of stops for viridis", () => {
    const stops = 10;
    const gradient = getGradientFromSchemeName("viridis", stops);

    expect(gradient).toHaveLength(stops);
    expect(gradient[0].value).toBe(0);
    expect(gradient[stops - 1].value).toBe(1);
  });

  it("should generate valid rgba color strings", () => {
    const gradient = getGradientFromSchemeName("viridis", 10);

    gradient.forEach(({ color }) => {
      expect(color).toMatch(/^#([0-9a-fA-F]{6})$/);
    });
  });

  it("should have evenly spaced stops", () => {
    const stops = 10;
    const gradient = getGradientFromSchemeName("viridis", stops);

    gradient.forEach(({ value }, index) => {
      const expectedValue = index / (stops - 1);
      expect(value).toBeCloseTo(expectedValue, 5);
    });
  });

  it("should have different colors for viridis and jet", () => {
    const stops = 10;
    const viridisGradient = getGradientFromSchemeName("viridis", stops);
    const jetGradient = getGradientFromSchemeName("jet", stops);

    let hasDifferentColors = false;
    for (let i = 0; i < stops; i++) {
      if (viridisGradient[i].color !== jetGradient[i].color) {
        hasDifferentColors = true;
        break;
      }
    }
    expect(hasDifferentColors).toBe(true);
  });

  it("should match known viridis color values at key points", () => {
    const gradient = getGradientFromSchemeName("viridis", 10);

    expect(gradient).toHaveLength(10);

    expect(gradient[0].color).toBe("#440154");
    expect(gradient[2].color).toBe("#3b518b");
    expect(gradient[4].color).toBe("#27818e");
  });
});
