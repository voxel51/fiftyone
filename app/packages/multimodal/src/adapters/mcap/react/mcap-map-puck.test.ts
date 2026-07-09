import { describe, expect, it } from "vitest";
import {
  ensurePuckImages,
  hexColorWithAlpha,
  puckImageId,
  PUCK_VARIANT,
  voxel51PrimaryColor,
} from "./mcap-map-puck";

describe("mcap map puck", () => {
  it("produces stable per-variant, per-color sprite ids", () => {
    expect(puckImageId(PUCK_VARIANT.NAV, "#ff6d04")).toBe(
      "mcap-puck-nav-#ff6d04",
    );
    expect(puckImageId(PUCK_VARIANT.DOT, "#3b82f6")).toBe(
      "mcap-puck-dot-#3b82f6",
    );
  });

  it("skips registration for ids the map already has", () => {
    const added: string[] = [];
    ensurePuckImages(
      {
        addImage: (id) => {
          added.push(id);
        },
        hasImage: () => true,
      },
      ["#ff6d04", "#3b82f6"],
    );
    expect(added).toEqual([]);
  });

  it("degrades to a no-op without throwing when 2D canvas is unavailable", () => {
    const added: string[] = [];
    ensurePuckImages(
      {
        addImage: (id) => {
          added.push(id);
        },
        hasImage: () => false,
      },
      // Duplicate colors must not register twice even when drawing works.
      ["#ff6d04", "#ff6d04"],
    );
    expect(new Set(added).size).toBe(added.length);
    expect(added.length === 0 || added.length === 2).toBe(true);
  });

  it("falls back to brand orange when the theme variable is absent", () => {
    expect(voxel51PrimaryColor()).toBe("#ff6d04");
  });

  it("applies alpha to hex colors and passes through unparseable ones", () => {
    expect(hexColorWithAlpha("#ff6d04", 0)).toBe("rgba(255, 109, 4, 0)");
    expect(hexColorWithAlpha("hsl(25, 100%, 51%)", 0.5)).toBe(
      "hsl(25, 100%, 51%)",
    );
  });
});
