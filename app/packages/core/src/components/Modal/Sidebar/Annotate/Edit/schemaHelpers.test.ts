import { describe, expect, it } from "vitest";
import { createTree } from "./schemaHelpers";

describe("createTree", () => {
  describe("single-select (multiSelect: false)", () => {
    it("returns a string-typed schema", () => {
      const result = createTree("species", "animals", false);
      expect(result.type).toBe("string");
    });

    it("sets the correct view component and name", () => {
      const result = createTree("species", "animals", false);
      expect(result.view?.name).toBe("TaxonomyView");
      expect(result.view?.component).toBe("TaxonomyView");
    });

    it("threads the label through to the view", () => {
      const result = createTree("species", "animals", false);
      expect(result.view?.label).toBe("species");
    });

    it("threads the taxonomy name through to the view", () => {
      const result = createTree("species", "animals", false);
      expect(result.view?.taxonomy).toBe("animals");
    });

    it("sets multiSelect: false on the view", () => {
      const result = createTree("species", "animals", false);
      expect(result.view?.multiSelect).toBe(false);
    });

    it("does not include an items field", () => {
      const result = createTree("species", "animals", false);
      expect((result as { items?: unknown }).items).toBeUndefined();
    });
  });

  describe("multi-select (multiSelect: true)", () => {
    it("returns an array-typed schema", () => {
      const result = createTree("tags", "vehicle-types", true);
      expect(result.type).toBe("array");
    });

    it("includes a string items definition", () => {
      const result = createTree("tags", "vehicle-types", true);
      expect((result as { items?: { type: string } }).items?.type).toBe(
        "string",
      );
    });

    it("sets the correct view component and name", () => {
      const result = createTree("tags", "vehicle-types", true);
      expect(result.view?.name).toBe("TaxonomyView");
      expect(result.view?.component).toBe("TaxonomyView");
    });

    it("threads the label through to the view", () => {
      const result = createTree("tags", "vehicle-types", true);
      expect(result.view?.label).toBe("tags");
    });

    it("threads the taxonomy name through to the view", () => {
      const result = createTree("tags", "vehicle-types", true);
      expect(result.view?.taxonomy).toBe("vehicle-types");
    });

    it("sets multiSelect: true on the view", () => {
      const result = createTree("tags", "vehicle-types", true);
      expect(result.view?.multiSelect).toBe(true);
    });
  });

  describe("multiSelect flag is the only structural difference", () => {
    it("single-select and multi-select produce different top-level types", () => {
      const single = createTree("label", "taxonomy", false);
      const multi = createTree("label", "taxonomy", true);
      expect(single.type).not.toBe(multi.type);
    });

    it("view.multiSelect reflects the argument faithfully", () => {
      expect(createTree("x", "t", false).view?.multiSelect).toBe(false);
      expect(createTree("x", "t", true).view?.multiSelect).toBe(true);
    });
  });
});
