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
  it("returns true when condition is undefined", () => {
    expect(evaluateWhen(undefined, {})).toBe(true);
  });

  describe("operator: equals (leaf)", () => {
    it("returns true when the field value equals the condition value", () => {
      expect(
        evaluateWhen(
          { operator: "equals", field: "category", value: "mammal" },
          { category: "mammal" }
        )
      ).toBe(true);
    });

    it("returns false when the field value does not match", () => {
      expect(
        evaluateWhen(
          { operator: "equals", field: "category", value: "mammal" },
          { category: "bird" }
        )
      ).toBe(false);
    });

    it("returns false when the field is absent from currentValues", () => {
      expect(
        evaluateWhen(
          { operator: "equals", field: "category", value: "mammal" },
          {}
        )
      ).toBe(false);
    });

    it("uses strict equality (no type coercion)", () => {
      const cond = { operator: "equals" as const, field: "score", value: 1 };
      expect(evaluateWhen(cond, { score: "1" })).toBe(false);
      expect(evaluateWhen(cond, { score: 1 })).toBe(true);
    });
  });

  describe("operator: in (leaf)", () => {
    it("returns true when field value is in the condition value array", () => {
      const cond = {
        operator: "in" as const,
        field: "category",
        value: ["mammal", "bird"],
      };
      expect(evaluateWhen(cond, { category: "mammal" })).toBe(true);
      expect(evaluateWhen(cond, { category: "bird" })).toBe(true);
    });

    it("returns false when field value is not in the array", () => {
      expect(
        evaluateWhen(
          { operator: "in", field: "category", value: ["mammal", "bird"] },
          { category: "reptile" }
        )
      ).toBe(false);
    });

    it("returns false when condition value is not an array", () => {
      expect(
        evaluateWhen(
          { operator: "in", field: "category", value: "mammal" },
          { category: "mammal" }
        )
      ).toBe(false);
    });
  });

  // Unknown leaf operators are prevented at compile time by LEAF_OPERATOR_HANDLERS
  // being typed as Record<AttributeConditionLeaf["operator"], ...>.

  describe("operator: and (group)", () => {
    it("returns true when ALL child conditions are satisfied", () => {
      expect(
        evaluateWhen(
          {
            operator: "and",
            conditions: [
              { operator: "equals", field: "category", value: "mammal" },
              { operator: "equals", field: "size", value: "large" },
            ],
          },
          { category: "mammal", size: "large" }
        )
      ).toBe(true);
    });

    it("returns false when only some child conditions are satisfied", () => {
      expect(
        evaluateWhen(
          {
            operator: "and",
            conditions: [
              { operator: "equals", field: "category", value: "mammal" },
              { operator: "equals", field: "size", value: "large" },
            ],
          },
          { category: "mammal", size: "small" }
        )
      ).toBe(false);
    });

    it("returns false when no child conditions are satisfied", () => {
      expect(
        evaluateWhen(
          {
            operator: "and",
            conditions: [
              { operator: "equals", field: "category", value: "mammal" },
              { operator: "equals", field: "category", value: "bird" },
            ],
          },
          { category: "reptile" }
        )
      ).toBe(false);
    });
  });

  describe("operator: or (group)", () => {
    it("returns true when any child condition is satisfied", () => {
      const cond = {
        operator: "or" as const,
        conditions: [
          { operator: "equals" as const, field: "category", value: "mammal" },
          { operator: "equals" as const, field: "category", value: "bird" },
        ],
      };
      expect(evaluateWhen(cond, { category: "mammal" })).toBe(true);
      expect(evaluateWhen(cond, { category: "bird" })).toBe(true);
    });

    it("returns false when no child condition is satisfied", () => {
      expect(
        evaluateWhen(
          {
            operator: "or",
            conditions: [
              { operator: "equals", field: "category", value: "mammal" },
              { operator: "equals", field: "category", value: "bird" },
            ],
          },
          { category: "reptile" }
        )
      ).toBe(false);
    });
  });

  describe("nested conditions", () => {
    it("AND containing an OR: passes when outer leaf and any inner OR branch match", () => {
      const cond = {
        operator: "and" as const,
        conditions: [
          { operator: "equals" as const, field: "has_damage", value: true },
          {
            operator: "or" as const,
            conditions: [
              {
                operator: "equals" as const,
                field: "region",
                value: "front",
              },
              { operator: "equals" as const, field: "region", value: "rear" },
            ],
          },
        ],
      };
      expect(evaluateWhen(cond, { has_damage: true, region: "front" })).toBe(
        true
      );
      expect(evaluateWhen(cond, { has_damage: true, region: "rear" })).toBe(
        true
      );
    });

    it("AND containing an OR: fails when outer leaf doesn't match", () => {
      const cond = {
        operator: "and" as const,
        conditions: [
          { operator: "equals" as const, field: "has_damage", value: true },
          {
            operator: "or" as const,
            conditions: [
              {
                operator: "equals" as const,
                field: "region",
                value: "front",
              },
              { operator: "equals" as const, field: "region", value: "rear" },
            ],
          },
        ],
      };
      expect(evaluateWhen(cond, { has_damage: false, region: "front" })).toBe(
        false
      );
    });

    it("OR containing an AND: passes when the AND branch is fully satisfied", () => {
      const cond = {
        operator: "or" as const,
        conditions: [
          { operator: "equals" as const, field: "priority", value: "urgent" },
          {
            operator: "and" as const,
            conditions: [
              {
                operator: "equals" as const,
                field: "category",
                value: "mammal",
              },
              { operator: "equals" as const, field: "size", value: "large" },
            ],
          },
        ],
      };
      expect(
        evaluateWhen(cond, {
          category: "mammal",
          size: "large",
          priority: "low",
        })
      ).toBe(true);
      expect(evaluateWhen(cond, { priority: "urgent" })).toBe(true);
    });

    it("deep nesting: AND(OR(leaf, AND(leaf, leaf)), leaf)", () => {
      const cond = {
        operator: "and" as const,
        conditions: [
          {
            operator: "or" as const,
            conditions: [
              { operator: "equals" as const, field: "a", value: 1 },
              {
                operator: "and" as const,
                conditions: [
                  { operator: "equals" as const, field: "b", value: 2 },
                  { operator: "equals" as const, field: "c", value: 3 },
                ],
              },
            ],
          },
          { operator: "equals" as const, field: "d", value: 4 },
        ],
      };
      // a=1 satisfies OR branch 1; d=4 satisfies outer AND leaf
      expect(evaluateWhen(cond, { a: 1, d: 4 })).toBe(true);
      // b=2, c=3 satisfies OR branch 2 (inner AND); d=4 satisfies outer AND leaf
      expect(evaluateWhen(cond, { b: 2, c: 3, d: 4 })).toBe(true);
      // neither OR branch satisfied
      expect(evaluateWhen(cond, { a: 0, b: 2, c: 0, d: 4 })).toBe(false);
      // outer leaf not satisfied
      expect(evaluateWhen(cond, { a: 1, d: 99 })).toBe(false);
    });
  });

  it("throws on an unknown operator (exhaustiveness guard)", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      evaluateWhen({ operator: "contains" as any, field: "x", value: "y" }, {})
    ).toThrow("Unhandled operator: contains");
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
  it("returns true when condition is undefined", () => {
    expect(isWhenFulfillable(undefined, animalAttributes)).toBe(true);
  });

  describe("operator: equals (leaf)", () => {
    it("returns true when the value exists in the referenced field's values", () => {
      expect(
        isWhenFulfillable(
          { operator: "equals", field: "category", value: "mammal" },
          animalAttributes
        )
      ).toBe(true);
    });

    it("returns false when the value is not in the referenced field's values", () => {
      expect(
        isWhenFulfillable(
          { operator: "equals", field: "category", value: "insect" },
          animalAttributes
        )
      ).toBe(false);
    });

    it("returns true when the referenced field has no values list (open-ended)", () => {
      expect(
        isWhenFulfillable(
          { operator: "equals", field: "notes", value: "foo" },
          animalAttributes
        )
      ).toBe(true);
    });
  });

  describe("operator: in (leaf)", () => {
    it("returns true when at least one value in the list is allowed", () => {
      expect(
        isWhenFulfillable(
          { operator: "in", field: "category", value: ["insect", "mammal"] },
          animalAttributes
        )
      ).toBe(true);
    });

    it("returns false when none of the values in the list are allowed", () => {
      expect(
        isWhenFulfillable(
          { operator: "in", field: "category", value: ["insect", "fungus"] },
          animalAttributes
        )
      ).toBe(false);
    });
  });

  describe("operator: and (group)", () => {
    it("returns true when ALL conditions are fulfillable", () => {
      expect(
        isWhenFulfillable(
          {
            operator: "and",
            conditions: [
              { operator: "equals", field: "category", value: "mammal" },
              { operator: "equals", field: "size", value: "large" },
            ],
          },
          animalAttributes
        )
      ).toBe(true);
    });

    it("returns false when any condition is unfulfillable", () => {
      expect(
        isWhenFulfillable(
          {
            operator: "and",
            conditions: [
              { operator: "equals", field: "category", value: "insect" },
              { operator: "equals", field: "category", value: "mammal" },
            ],
          },
          animalAttributes
        )
      ).toBe(false);
    });

    it("returns false when all conditions are unfulfillable", () => {
      expect(
        isWhenFulfillable(
          {
            operator: "and",
            conditions: [
              { operator: "equals", field: "category", value: "insect" },
              { operator: "equals", field: "category", value: "fungus" },
            ],
          },
          animalAttributes
        )
      ).toBe(false);
    });
  });

  describe("operator: or (group)", () => {
    it("returns true when at least one child is fulfillable", () => {
      expect(
        isWhenFulfillable(
          {
            operator: "or",
            conditions: [
              { operator: "equals", field: "category", value: "insect" },
              { operator: "equals", field: "category", value: "mammal" },
            ],
          },
          animalAttributes
        )
      ).toBe(true);
    });

    it("returns false when all children are unfulfillable", () => {
      expect(
        isWhenFulfillable(
          {
            operator: "or",
            conditions: [
              { operator: "equals", field: "category", value: "insect" },
              { operator: "equals", field: "category", value: "fungus" },
            ],
          },
          animalAttributes
        )
      ).toBe(false);
    });
  });

  describe("nested groups", () => {
    it("AND(OR(fulfillable, unfulfillable), fulfillable) is fulfillable", () => {
      expect(
        isWhenFulfillable(
          {
            operator: "and",
            conditions: [
              {
                operator: "or",
                conditions: [
                  { operator: "equals", field: "category", value: "mammal" },
                  { operator: "equals", field: "category", value: "insect" },
                ],
              },
              { operator: "equals", field: "size", value: "large" },
            ],
          },
          animalAttributes
        )
      ).toBe(true);
    });

    it("AND(OR(unfulfillable, unfulfillable), fulfillable) is not fulfillable", () => {
      expect(
        isWhenFulfillable(
          {
            operator: "and",
            conditions: [
              {
                operator: "or",
                conditions: [
                  { operator: "equals", field: "category", value: "insect" },
                  { operator: "equals", field: "category", value: "fungus" },
                ],
              },
              { operator: "equals", field: "size", value: "large" },
            ],
          },
          animalAttributes
        )
      ).toBe(false);
    });
  });

  it("returns true for a fulfillable named attribute", () => {
    expect(
      isWhenFulfillable(
        { operator: "equals", field: "category", value: "mammal" },
        animalAttributes
      )
    ).toBe(true);
  });

  it("returns false for a fictitious value not in the category list", () => {
    expect(
      isWhenFulfillable(
        { operator: "equals", field: "category", value: "dragon" },
        animalAttributes
      )
    ).toBe(false);
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
        when: {
          operator: "equals" as const,
          field: "category",
          value: "mammal",
        },
      },
      {
        name: "animal_name",
        type: "str",
        component: "dropdown",
        values: ["snake", "lizard"],
        when: {
          operator: "equals" as const,
          field: "category",
          value: "reptile",
        },
      },
    ];

    it("finds a value from the first duplicate entry even when the second entry is last", () => {
      expect(
        isWhenFulfillable(
          { operator: "equals", field: "animal_name", value: "dog" },
          duplicateNameAttributes
        )
      ).toBe(true);
    });

    it("finds a value from the second duplicate entry", () => {
      expect(
        isWhenFulfillable(
          { operator: "equals", field: "animal_name", value: "snake" },
          duplicateNameAttributes
        )
      ).toBe(true);
    });

    it("returns false when the value is in neither duplicate entry", () => {
      expect(
        isWhenFulfillable(
          { operator: "equals", field: "animal_name", value: "dragon" },
          duplicateNameAttributes
        )
      ).toBe(false);
    });

    it("produces the same result regardless of duplicate entry order", () => {
      const reversed: AttributeConfig[] = [
        duplicateNameAttributes[0],
        duplicateNameAttributes[2], // reptile first
        duplicateNameAttributes[1], // mammal second
      ];
      const cond = {
        operator: "equals" as const,
        field: "animal_name",
        value: "dog",
      };
      expect(isWhenFulfillable(cond, duplicateNameAttributes)).toBe(
        isWhenFulfillable(cond, reversed)
      );
    });
  });

  it("throws on an unknown operator (exhaustiveness guard)", () => {
    expect(() =>
      isWhenFulfillable(
        // Cast through `any` to simulate a future operator arriving at runtime
        // before the frontend is updated (e.g. from a newer backend).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { operator: "contains" as any, field: "category", value: "mammal" },
        animalAttributes
      )
    ).toThrow("Unhandled operator: contains");
  });

  it("throws on an unknown operator inside a group node (exhaustiveness guard)", () => {
    expect(() =>
      isWhenFulfillable(
        {
          operator: "and",
          conditions: [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { operator: "contains" as any, field: "category", value: "mammal" },
          ],
        },
        animalAttributes
      )
    ).toThrow("Unhandled operator: contains");
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
    when: { operator: "equals" as const, field: "category", value: "mammal" },
  },
  {
    name: "animal_name",
    type: "str",
    component: "dropdown",
    values: ["snake", "lizard"],
    when: { operator: "equals" as const, field: "category", value: "reptile" },
  },
  {
    name: "impossible_field",
    type: "str",
    component: "text",
    when: { operator: "equals" as const, field: "category", value: "dragon" },
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

  describe("WhenAnd entry — variant gated on two conditions", () => {
    const schemaWithAndVariant: AttributeConfig[] = [
      {
        name: "has_damage",
        type: "bool",
        component: "checkbox",
      },
      {
        name: "vehicle_type",
        type: "str",
        component: "dropdown",
        values: ["car", "truck", "motorcycle"],
      },
      {
        name: "damage_location",
        type: "str",
        component: "dropdown",
        values: ["front", "rear"],
        when: {
          operator: "and" as const,
          conditions: [
            { operator: "equals" as const, field: "has_damage", value: true },
            {
              operator: "in" as const,
              field: "vehicle_type",
              value: ["car", "truck"],
            },
          ],
        },
      },
    ];

    it("resolves the entry when both AND conditions are met", () => {
      const result = resolveVisibleAttribute(
        "damage_location",
        schemaWithAndVariant,
        { has_damage: true, vehicle_type: "car" }
      );
      expect(result).toBe(schemaWithAndVariant[2]);
    });

    it("returns undefined when only one AND condition is met", () => {
      const result = resolveVisibleAttribute(
        "damage_location",
        schemaWithAndVariant,
        { has_damage: true, vehicle_type: "motorcycle" }
      );
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Mixed conditional + unconditional variants for the same attribute name
//
// This covers the guard added to useHandleSchemaChange in AnnotationSchema.tsx:
// when a name has BOTH a conditional and an unconditional entry, the deletion
// logic must skip that name entirely, because resolveVisibleAttribute only
// inspects `when`-bearing entries and would return `undefined` for the hidden
// conditional — incorrectly triggering deletion of the unconditional value.
// ---------------------------------------------------------------------------

describe("mixed conditional/unconditional variants for the same name", () => {
  // "notes" appears twice: once unconditionally (always visible) and once
  // gated on category === "mammal".
  const mixedAttributes: AttributeConfig[] = [
    {
      name: "category",
      type: "str",
      component: "dropdown",
      values: ["mammal", "bird"],
    },
    {
      // Always visible — no `when`
      name: "notes",
      type: "str",
      component: "text",
    },
    {
      // Conditional sibling — only visible when category is "mammal"
      name: "notes",
      type: "str",
      component: "text",
      when: { operator: "equals" as const, field: "category", value: "mammal" },
    },
  ];

  it("resolveVisibleAttribute returns undefined when the conditional sibling is hidden", () => {
    // category = "bird" hides the conditional variant; the unconditional one
    // is invisible to resolveVisibleAttribute (it filters by a.when truthy).
    // Without the guard this `undefined` would trigger deletion of the value.
    const result = resolveVisibleAttribute("notes", mixedAttributes, {
      category: "bird",
    });
    expect(result).toBeUndefined();
  });

  it("resolveVisibleAttribute returns the conditional entry when it is visible", () => {
    // Both variants coexist for category = "mammal"; resolveVisibleAttribute
    // still returns the conditional entry (not the unconditional one).
    const result = resolveVisibleAttribute("notes", mixedAttributes, {
      category: "mammal",
    });
    // The conditional entry (index 2) wins; the unconditional one is ignored.
    expect(result).toBe(mixedAttributes[2]);
  });

  it("unconditional-sibling guard check returns true for a mixed name", () => {
    // This is the exact predicate used in the AnnotationSchema fix.
    const hasUnconditional = mixedAttributes.some(
      (a) => a.name === "notes" && !a.when
    );
    expect(hasUnconditional).toBe(true);
  });

  it("unconditional-sibling guard check returns false for a purely conditional name", () => {
    // "animal_name" in schemaWithVariants has no unconditional entry, so the
    // guard does NOT fire and deletion logic proceeds normally.
    const hasUnconditional = schemaWithVariants.some(
      (a) => a.name === "animal_name" && !a.when
    );
    expect(hasUnconditional).toBe(false);
  });
});
