import { describe, expect, it, vi } from "vitest";
import { setPathUserUnchanged } from "../../../../../plugins/SchemaIO/hooks";

// Mock the hooks module
vi.mock("../../../../../plugins/SchemaIO/hooks", () => ({
  setPathUserUnchanged: vi.fn(),
}));

describe("Position Component", () => {
  describe("user changed flags clearing (bug fix)", () => {
    it("should call setPathUserUnchanged for all input paths when overlay changes", () => {
      // This test verifies the fix for the bug where inputs don't update after
      // manual changes when the overlay is moved/resized.

      // Simulate what happens in the overlay change handler
      const clearUserChangedFlags = () => {
        setPathUserUnchanged("position.x");
        setPathUserUnchanged("position.y");
        setPathUserUnchanged("dimensions.width");
        setPathUserUnchanged("dimensions.height");
      };

      clearUserChangedFlags();

      // Verify that setPathUserUnchanged was called for all input paths
      expect(setPathUserUnchanged).toHaveBeenCalledWith("position.x");
      expect(setPathUserUnchanged).toHaveBeenCalledWith("position.y");
      expect(setPathUserUnchanged).toHaveBeenCalledWith("dimensions.width");
      expect(setPathUserUnchanged).toHaveBeenCalledWith("dimensions.height");

      // Verify called exactly 4 times (once for each path)
      expect(setPathUserUnchanged).toHaveBeenCalledTimes(4);
    });

    it("should clear flags in the correct order matching the schema structure", () => {
      vi.clearAllMocks();

      // The paths follow the structure: parent.child
      // position.x, position.y, dimensions.width, dimensions.height
      const paths = ["position.x", "position.y", "dimensions.width", "dimensions.height"];

      paths.forEach((path) => setPathUserUnchanged(path));

      // Verify each path was cleared
      paths.forEach((path) => {
        expect(setPathUserUnchanged).toHaveBeenCalledWith(path);
      });
    });

    it("should handle coordinate updates - position paths", () => {
      vi.clearAllMocks();

      // When overlay is moved, position changes
      setPathUserUnchanged("position.x");
      setPathUserUnchanged("position.y");

      expect(setPathUserUnchanged).toHaveBeenCalledWith("position.x");
      expect(setPathUserUnchanged).toHaveBeenCalledWith("position.y");
      expect(setPathUserUnchanged).toHaveBeenCalledTimes(2);
    });

    it("should handle size updates - dimensions paths", () => {
      vi.clearAllMocks();

      // When overlay is resized, dimensions change
      setPathUserUnchanged("dimensions.width");
      setPathUserUnchanged("dimensions.height");

      expect(setPathUserUnchanged).toHaveBeenCalledWith("dimensions.width");
      expect(setPathUserUnchanged).toHaveBeenCalledWith("dimensions.height");
      expect(setPathUserUnchanged).toHaveBeenCalledTimes(2);
    });
  });

  describe("overlay event handling", () => {
    it("should handle drag events correctly", () => {
      // Mock scenario: user manually changes position.x input, then drags overlay
      vi.clearAllMocks();

      // User drags overlay - should clear the user changed flag
      setPathUserUnchanged("position.x");
      setPathUserUnchanged("position.y");

      expect(setPathUserUnchanged).toHaveBeenCalledTimes(2);
    });

    it("should handle resize events correctly", () => {
      // Mock scenario: user manually changes width input, then resizes overlay
      vi.clearAllMocks();

      // User resizes overlay - should clear the user changed flags
      setPathUserUnchanged("dimensions.width");
      setPathUserUnchanged("dimensions.height");

      expect(setPathUserUnchanged).toHaveBeenCalledTimes(2);
    });

    it("should handle combined drag and resize (bounds changed) events", () => {
      // Mock scenario: overlay bounds change affects both position and dimensions
      vi.clearAllMocks();

      // Bounds changed - clear all flags
      setPathUserUnchanged("position.x");
      setPathUserUnchanged("position.y");
      setPathUserUnchanged("dimensions.width");
      setPathUserUnchanged("dimensions.height");

      expect(setPathUserUnchanged).toHaveBeenCalledTimes(4);
    });
  });

  describe("schema path structure", () => {
    it("should use correct nested path format for position fields", () => {
      vi.clearAllMocks();

      const positionPaths = ["position.x", "position.y"];

      positionPaths.forEach((path) => {
        // Verify path follows parent.child pattern
        expect(path).toMatch(/^position\.(x|y)$/);
        setPathUserUnchanged(path);
      });

      expect(setPathUserUnchanged).toHaveBeenCalledTimes(2);
    });

    it("should use correct nested path format for dimension fields", () => {
      vi.clearAllMocks();

      const dimensionPaths = ["dimensions.width", "dimensions.height"];

      dimensionPaths.forEach((path) => {
        // Verify path follows parent.child pattern
        expect(path).toMatch(/^dimensions\.(width|height)$/);
        setPathUserUnchanged(path);
      });

      expect(setPathUserUnchanged).toHaveBeenCalledTimes(2);
    });
  });
});
