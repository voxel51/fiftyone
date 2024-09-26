import { describe, expect, it } from "vitest";
import { getGradientStringForSeekbar } from "./utils";

describe("getGradientStringForSeekbar", () => {
  const colorMap = {
    unBuffered: "gray",
    currentProgress: "blue",
    buffered: "green",
    loading: "red",
  };

  it("should return unbuffered gradient when there are no ranges and valueScaled is 0", () => {
    const result = getGradientStringForSeekbar(
      [], // loadedRangesScaled
      [0, 0], // loadingRangeScaled
      0, // valueScaled
      colorMap
    );
    expect(result).toBe("linear-gradient(to right, gray 0% 100%)");
  });

  it("should display current progress when valueScaled is greater than 0", () => {
    const result = getGradientStringForSeekbar([], [0, 0], 50, colorMap);
    expect(result).toBe(
      "linear-gradient(to right, blue 0% 50%, gray 50% 100%)"
    );
  });

  it("should handle fully buffered range", () => {
    const result = getGradientStringForSeekbar(
      [[0, 100]],
      [0, 0],
      50,
      colorMap
    );
    expect(result).toBe(
      "linear-gradient(to right, blue 0% 50%, green 50% 100%)"
    );
  });

  it("should handle loading range overlapping with current progress", () => {
    const result = getGradientStringForSeekbar([], [40, 60], 50, colorMap);
    expect(result).toBe(
      "linear-gradient(to right, blue 0% 50%, red 50% 60%, gray 60% 100%)"
    );
  });

  it("should handle multiple loaded ranges and loading range", () => {
    const result = getGradientStringForSeekbar(
      [
        [0, 20],
        [30, 50],
        [60, 80],
      ],
      [50, 60],
      70,
      colorMap
    );
    expect(result).toBe(
      "linear-gradient(to right, blue 0% 70%, green 70% 80%, gray 80% 100%)"
    );
  });

  it("should prioritize colors correctly when ranges overlap", () => {
    const result = getGradientStringForSeekbar(
      [[20, 80]],
      [40, 60],
      50,
      colorMap
    );
    expect(result).toBe(
      "linear-gradient(to right, blue 0% 50%, red 50% 60%, green 60% 80%, gray 80% 100%)"
    );
  });

  it("should handle zero-length loading range", () => {
    const result = getGradientStringForSeekbar([], [50, 50], 50, colorMap);
    expect(result).toBe(
      "linear-gradient(to right, blue 0% 50%, gray 50% 100%)"
    );
  });

  it("should handle zero-length loaded range", () => {
    const result = getGradientStringForSeekbar(
      [[70, 70]],
      [0, 0],
      50,
      colorMap
    );
    expect(result).toBe(
      "linear-gradient(to right, blue 0% 50%, gray 50% 100%)"
    );
  });

  it("should handle full progress and fully loaded", () => {
    const result = getGradientStringForSeekbar(
      [[0, 100]],
      [0, 0],
      100,
      colorMap
    );
    expect(result).toBe("linear-gradient(to right, blue 0% 100%)");
  });
});
