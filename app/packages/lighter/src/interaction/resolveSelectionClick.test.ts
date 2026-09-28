import { describe, expect, it } from "vitest";
import { resolveSelectionClick } from "./resolveSelectionClick";

const click = (over: Partial<Parameters<typeof resolveSelectionClick>[0]>) =>
  resolveSelectionClick({
    isSelectableOverlay: true,
    isSelected: false,
    isDrawingOver: false,
    multipleSelection: false,
    ...over,
  });

describe("resolveSelectionClick", () => {
  describe("single-select scene (the annotation surfaces)", () => {
    it("selects an overlay that is not selected yet", () => {
      expect(click({})).toBe("select");
    });

    /**
     * Re-clicking the overlay you already picked is the start of a drag on it.
     * Deselecting there would strand the gesture — the overlay would lose its
     * handles mid-press.
     */
    it("does nothing to the overlay it has already selected", () => {
      expect(click({ isSelected: true })).toBe("none");
    });
  });

  describe("multi-select scene (video Explore)", () => {
    it("toggles an unselected overlay in", () => {
      expect(click({ multipleSelection: true })).toBe("toggle");
    });

    /**
     * The half that single-select cannot express: with several boxes
     * selected, clicking one again is the only gesture that removes it.
     */
    it("toggles an already-selected overlay back out", () => {
      expect(click({ multipleSelection: true, isSelected: true })).toBe(
        "toggle",
      );
    });
  });

  describe("regardless of scene mode", () => {
    it("ignores a click on empty canvas", () => {
      for (const multipleSelection of [false, true]) {
        expect(click({ isSelectableOverlay: false, multipleSelection })).toBe(
          "none",
        );
      }
    });

    it("yields to a draw tool working over an overlay", () => {
      for (const multipleSelection of [false, true]) {
        expect(click({ isDrawingOver: true, multipleSelection })).toBe("none");
      }
    });

    it("yields to a draw tool even over a selected overlay", () => {
      expect(
        click({
          isDrawingOver: true,
          isSelected: true,
          multipleSelection: true,
        }),
      ).toBe("none");
    });
  });
});
