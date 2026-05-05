import { describe, expect, it } from "vitest";
import {
  evaluateWhen,
  isWhenFulfillable,
  resolveVisibleAttribute,
} from "./evaluateWhen";
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

  describe("duplicate attribute names — values are merged, not overwritten", () => {
    // Schema with two "animal_name" entries sharing the same name but carrying
    // different allowed values (mammal variants first, reptile variants second).
    const duplicateNameAttributes: AttributeConfig[] = [
      {
        name: "category",
        type: "str",
        component: "dropdown",
        values: ["mammal", "reptile"],
      },
      {
        name: "animal_name",
        type: "str",
        component: "dropdown",
        values: ["dog", "cat"],
        when: [
          { operator: "equals" as const, field: "category", value: "mammal" },
        ],
      },
      {
        name: "animal_name",
        type: "str",
        component: "dropdown",
        values: ["snake", "lizard"],
        when: [
          { operator: "equals" as const, field: "category", value: "reptile" },
        ],
      },
    ];

    it("finds a value from the first duplicate entry even when the second entry is last", () => {
      const conditions = [
        {
          operator: "equals" as const,
          field: "animal_name",
          value: "dog",
        },
      ];
      expect(isWhenFulfillable(conditions, duplicateNameAttributes)).toBe(true);
    });

    it("finds a value from the second duplicate entry", () => {
      const conditions = [
        {
          operator: "equals" as const,
          field: "animal_name",
          value: "snake",
        },
      ];
      expect(isWhenFulfillable(conditions, duplicateNameAttributes)).toBe(true);
    });

    it("returns false when the value is in neither duplicate entry", () => {
      const conditions = [
        {
          operator: "equals" as const,
          field: "animal_name",
          value: "dragon",
        },
      ];
      expect(isWhenFulfillable(conditions, duplicateNameAttributes)).toBe(
        false
      );
    });

    it("produces the same result regardless of duplicate entry order", () => {
      const reversed: AttributeConfig[] = [
        duplicateNameAttributes[0],
        duplicateNameAttributes[2], // reptile first
        duplicateNameAttributes[1], // mammal second
      ];
      const conditions = [
        { operator: "equals" as const, field: "animal_name", value: "dog" },
      ];
      expect(isWhenFulfillable(conditions, duplicateNameAttributes)).toBe(
        isWhenFulfillable(conditions, reversed)
      );
    });
  });

  it("throws on an unknown operator (exhaustiveness guard)", () => {
    const conditions = [
      // Cast through `any` to simulate a future operator arriving at runtime
      // before the frontend is updated (e.g. from a newer backend).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { operator: "contains" as any, field: "category", value: "mammal" },
    ];
    expect(() => isWhenFulfillable(conditions, animalAttributes)).toThrow(
      "Unhandled operator: contains"
    );
  });
});

// ---------------------------------------------------------------------------
// resolveVisibleAttribute
// ---------------------------------------------------------------------------

const schemaWithVariants: AttributeConfig[] = [
  {
    name: "category",
    type: "str",
    component: "dropdown",
    values: ["mammal", "reptile", "bird"],
  },
  {
    name: "animal_name",
    type: "str",
    component: "dropdown",
    values: ["dog", "cat"],
    when: [{ operator: "equals" as const, field: "category", value: "mammal" }],
  },
  {
    name: "animal_name",
    type: "str",
    component: "dropdown",
    values: ["snake", "lizard"],
    when: [
      { operator: "equals" as const, field: "category", value: "reptile" },
    ],
  },
  {
    name: "impossible_field",
    type: "str",
    component: "text",
    when: [{ operator: "equals" as const, field: "category", value: "dragon" }],
  },
  {
    name: "size",
    type: "str",
    component: "radio",
    values: ["small", "medium", "large"],
  },
];

describe("resolveVisibleAttribute", () => {
  it("returns the mammal entry when category is mammal", () => {
    const result = resolveVisibleAttribute("animal_name", schemaWithVariants, {
      category: "mammal",
    });
    expect(result).toBe(schemaWithVariants[1]);
  });

  it("returns the reptile entry when category is reptile", () => {
    const result = resolveVisibleAttribute("animal_name", schemaWithVariants, {
      category: "reptile",
    });
    expect(result).toBe(schemaWithVariants[2]);
  });

  it("returns undefined when no variant matches", () => {
    const result = resolveVisibleAttribute("animal_name", schemaWithVariants, {
      category: "bird",
    });
    expect(result).toBeUndefined();
  });

  it("returns the unfulfillable entry regardless of form data", () => {
    const result = resolveVisibleAttribute(
      "impossible_field",
      schemaWithVariants,
      { category: "mammal" }
    );
    expect(result).toBe(schemaWithVariants[3]);
  });

  it("returns the same unfulfillable entry even with empty form data", () => {
    const result = resolveVisibleAttribute(
      "impossible_field",
      schemaWithVariants,
      {}
    );
    expect(result).toBe(schemaWithVariants[3]);
  });

  it("returns undefined for attributes without when conditions", () => {
    const result = resolveVisibleAttribute("size", schemaWithVariants, {
      category: "mammal",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined for a name that does not exist in the schema", () => {
    const result = resolveVisibleAttribute("nonexistent", schemaWithVariants, {
      category: "mammal",
    });
    expect(result).toBeUndefined();
  });

  it("switching category changes the winning entry", () => {
    const before = resolveVisibleAttribute("animal_name", schemaWithVariants, {
      category: "mammal",
    });
    const after = resolveVisibleAttribute("animal_name", schemaWithVariants, {
      category: "reptile",
    });
    expect(before).not.toBe(after);
    expect(before).toBe(schemaWithVariants[1]);
    expect(after).toBe(schemaWithVariants[2]);
  });

  it("changing an unrelated field keeps the same winning entry", () => {
    const before = resolveVisibleAttribute("animal_name", schemaWithVariants, {
      category: "mammal",
      size: "small",
    });
    const after = resolveVisibleAttribute("animal_name", schemaWithVariants, {
      category: "mammal",
      size: "large",
    });
    expect(before).toBe(after);
  });
});
