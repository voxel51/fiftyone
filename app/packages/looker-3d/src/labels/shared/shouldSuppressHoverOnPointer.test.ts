import { describe, expect, it } from "vitest";
import { PANEL_ID_MAIN, PANEL_ID_SIDE_TOP } from "../../constants";
import { shouldSuppressHoverOnPointer } from "./shouldSuppressHoverOnPointer";

describe("shouldSuppressHoverOnPointer", () => {
  it("suppresses in the main panel while transforming", () => {
    expect(shouldSuppressHoverOnPointer(PANEL_ID_MAIN, true, 0)).toBe(true);
  });

  it("suppresses in a side panel while transforming (FOEPD-4280)", () => {
    expect(shouldSuppressHoverOnPointer(PANEL_ID_SIDE_TOP, true, 0)).toBe(true);
  });

  it("does not suppress in a side panel when not transforming, even with a button held", () => {
    expect(shouldSuppressHoverOnPointer(PANEL_ID_SIDE_TOP, false, 1)).toBe(
      false,
    );
  });

  it("suppresses in the main panel with a button held even when not transforming (crop-drag guard)", () => {
    expect(shouldSuppressHoverOnPointer(PANEL_ID_MAIN, false, 1)).toBe(true);
  });

  it("does not suppress in the main panel when idle", () => {
    expect(shouldSuppressHoverOnPointer(PANEL_ID_MAIN, false, 0)).toBe(false);
  });
});
