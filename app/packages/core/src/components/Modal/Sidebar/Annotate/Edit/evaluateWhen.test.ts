import { describe, expect, it } from "vitest";
import { evaluateWhen, isWhenFulfillable } from "./evaluateWhen";
import type { AttributeConfig } from "../SchemaManager/utils";

// ---------------------------------------------------------------------------
// evaluateWhen
// ---------------------------------------------------------------------------

describe("evaluateWhen", () => {
  it("returns true when conditions are undefined", () => {
    expect(evaluateWhen(undefined, {})).toBe(true);
  });

  it("returns true when conditions array is empty", () => {
    expect(evaluateWhen([], { category: "mammal" })).toBe(true);
  });

  describe("operator: equals", () => {
    it("returns true when the field value equals the condition value", () => {
      const conditions = [
        { operator: "equals" as const, field: "category", value: "mammal" },
      ];
      expect(evaluateWhen(conditions, { category: "mammal" })).toBe(true);
    });

    it("returns false when the field value does not match", () => {
      const conditions = [
        { operator: "equals" as const, field: "category", value: "mammal" },
      ];
      expect(evaluateWhen(conditions, { category: "bird" })).toBe(false);
    });

    it("returns false when the field is absent from currentValues", () => {
      const conditions = [
        { operator: "equals" as const, field: "category", value: "mammal" },
      ];
      expect(evaluateWhen(conditions, {})).toBe(false);
    });

    it("uses strict equality (no type coercion)", () => {
      const conditions = [
        { operator: "equals" as const, field: "score", value: 1 },
      ];
      expect(evaluateWhen(conditions, { score: "1" })).toBe(false);
      expect(evaluateWhen(conditions, { score: 1 })).toBe(true);
    });
  });

  describe("operator: in", () => {
    it("returns true when field value is in the condition value array", () => {
      const conditions = [
        {
          operator: "in" as const,
          field: "category",
          value: ["mammal", "bird"],
        },
      ];
      expect(evaluateWhen(conditions, { category: "mammal" })).toBe(true);
      expect(evaluateWhen(conditions, { category: "bird" })).toBe(true);
    });

    it("returns false when field value is not in the array", () => {
      const conditions = [
        {
          operator: "in" as const,
          field: "category",
          value: ["mammal", "bird"],
        },
      ];
      expect(evaluateWhen(conditions, { category: "reptile" })).toBe(false);
    });

    it("returns false when condition value is not an array", () => {
      const conditions = [
        { operator: "in" as const, field: "category", value: "mammal" },
      ];
      expect(evaluateWhen(conditions, { category: "mammal" })).toBe(false);
    });
  });

  // Unknown operators are prevented at compile time: OPERATOR_HANDLERS is
  // typed as Record<AttributeCondition["operator"], ...>, so TypeScript will
  // error if a new operator is added to the union without a handler entry.

  describe("OR semantics — multiple conditions", () => {
    it("returns true if ANY condition is satisfied", () => {
      const conditions = [
        { operator: "equals" as const, field: "category", value: "mammal" },
        { operator: "equals" as const, field: "category", value: "bird" },
      ];
      expect(evaluateWhen(conditions, { category: "bird" })).toBe(true);
    });

    it("returns false when no conditions are satisfied", () => {
      const conditions = [
        { operator: "equals" as const, field: "category", value: "mammal" },
        { operator: "equals" as const, field: "category", value: "bird" },
      ];
      expect(evaluateWhen(conditions, { category: "reptile" })).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// isWhenFulfillable
// ---------------------------------------------------------------------------

const animalAttributes: AttributeConfig[] = [
  {
    name: "category",
    type: "str",
    component: "dropdown",
    values: ["mammal", "reptile", "bird", "other"],
  },
  {
    name: "size",
    type: "str",
    component: "radio",
    values: ["small", "medium", "large"],
  },
];

describe("isWhenFulfillable", () => {
  it("returns true when conditions are undefined", () => {
    expect(isWhenFulfillable(undefined, animalAttributes)).toBe(true);
  });

  it("returns true when conditions are empty", () => {
    expect(isWhenFulfillable([], animalAttributes)).toBe(true);
  });

  describe("operator: equals", () => {
    it("returns true when the value exists in the referenced field's values", () => {
      const conditions = [
        { operator: "equals" as const, field: "category", value: "mammal" },
      ];
      expect(isWhenFulfillable(conditions, animalAttributes)).toBe(true);
    });

    it("returns false when the value is not in the referenced field's values", () => {
      const conditions = [
        { operator: "equals" as const, field: "category", value: "insect" },
      ];
      expect(isWhenFulfillable(conditions, animalAttributes)).toBe(false);
    });

    it("returns true when the referenced field has no values list (open-ended)", () => {
      const conditions = [
        { operator: "equals" as const, field: "notes", value: "foo" },
      ];
      expect(isWhenFulfillable(conditions, animalAttributes)).toBe(true);
    });
  });

  describe("operator: in", () => {
    it("returns true when at least one value in the list is allowed", () => {
      const conditions = [
        {
          operator: "in" as const,
          field: "category",
          value: ["insect", "mammal"],
        },
      ];
      expect(isWhenFulfillable(conditions, animalAttributes)).toBe(true);
    });

    it("returns false when none of the values in the list are allowed", () => {
      const conditions = [
        {
          operator: "in" as const,
          field: "category",
          value: ["insect", "fungus"],
        },
      ];
      expect(isWhenFulfillable(conditions, animalAttributes)).toBe(false);
    });
  });

  describe("OR semantics — multiple conditions", () => {
    it("returns true if ANY condition is fulfillable", () => {
      const conditions = [
        { operator: "equals" as const, field: "category", value: "insect" },
        { operator: "equals" as const, field: "category", value: "mammal" },
      ];
      expect(isWhenFulfillable(conditions, animalAttributes)).toBe(true);
    });

    it("returns false when all conditions are unfulfillable", () => {
      const conditions = [
        { operator: "equals" as const, field: "category", value: "insect" },
        { operator: "equals" as const, field: "category", value: "fungus" },
      ];
      expect(isWhenFulfillable(conditions, animalAttributes)).toBe(false);
    });
  });

  it("returns true for the ontology_test is_domesticated attribute", () => {
    const conditions = [
      { operator: "equals" as const, field: "category", value: "mammal" },
    ];
    expect(isWhenFulfillable(conditions, animalAttributes)).toBe(true);
  });

  it("returns false for a fictitious value not in ontology_test category list", () => {
    const conditions = [
      { operator: "equals" as const, field: "category", value: "dragon" },
    ];
    expect(isWhenFulfillable(conditions, animalAttributes)).toBe(false);
  });
});
