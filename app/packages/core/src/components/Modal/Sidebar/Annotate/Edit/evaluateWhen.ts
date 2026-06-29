import type {
  AttributeCondition,
  AttributeConditionLeaf,
  AttributeConfig,
} from "../SchemaManager/utils";

/**
 * Handler signature for a single leaf operator.
 *
 * @param fieldValue - The current value of the referenced field.
 * @param condValue  - The value (or array of values) declared in the condition.
 *
 * Note: comparison assumes primitive values. If condValue or fieldValue could
 * be objects, we'll need to implement a deep-equality check.
 */
type LeafOperatorHandler = (fieldValue: unknown, condValue: unknown) => boolean;

/**
 * Typed map of every supported leaf `when` operator to its evaluation logic.
 *
 * Using `Record<AttributeConditionLeaf["operator"], ...>` means TypeScript will
 * produce a compile error here if a new leaf operator is added to the union
 * without a corresponding handler — ensuring no operator is silently unhandled
 * at runtime.
 */
const LEAF_OPERATOR_HANDLERS: Record<
  AttributeConditionLeaf["operator"],
  LeafOperatorHandler
> = {
  equals: (fieldValue, condValue) => fieldValue === condValue,
  in: (fieldValue, condValue) =>
    Array.isArray(condValue) && condValue.includes(fieldValue),
};

/**
 * Recursively evaluates a single condition node against the current label
 * field values.
 *
 * - `"and"` nodes pass when every child passes.
 * - `"or"` nodes pass when any child passes.
 * - `"equals"` / `"in"` leaves delegate to {@link LEAF_OPERATOR_HANDLERS}.
 */
function evaluateCondition(
  cond: AttributeCondition,
  currentValues: Record<string, unknown>,
): boolean {
  switch (cond.operator) {
    case "and":
      return cond.conditions.every((c) => evaluateCondition(c, currentValues));
    case "or":
      return cond.conditions.some((c) => evaluateCondition(c, currentValues));
    case "equals":
    case "in": {
      const handler = LEAF_OPERATOR_HANDLERS[cond.operator];
      return handler(currentValues[cond.field], cond.value);
    }
    default: {
      const _exhaustive: never = cond;
      throw new Error(
        `Unhandled operator: ${(_exhaustive as AttributeCondition).operator}`,
      );
    }
  }
}

/**
 * Evaluates a `when` condition tree against the current label field values.
 *
 * Visibility semantics: an attribute is visible only if its condition tree
 * evaluates to true. Compose AND / OR logic via
 * {@link AttributeConditionAnd} / {@link AttributeConditionOr} nodes; a bare
 * leaf condition is a single field check.
 *
 * @param condition - The `when` root node from an attribute definition, or
 *   `undefined` for unconditionally-visible attributes.
 * @param currentValues - Flat map of the label's current field values
 *   (e.g. `{ label: "dog", category: "mammal" }`).
 * @returns `true` if the attribute should be shown, `false` if it should be
 *   hidden.
 */
export function evaluateWhen(
  condition: AttributeCondition | undefined,
  currentValues: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  return evaluateCondition(condition, currentValues);
}

/**
 * Recursively determines whether a condition node can ever be satisfied given
 * the possible values of the referenced fields in the schema.
 *
 * - `"and"` is fulfillable when every child is fulfillable.
 * - `"or"` is fulfillable when any child is fulfillable.
 * - Leaf nodes check whether the referenced field's allowed value set contains
 *   a matching value.
 */
function isConditionFulfillable(
  cond: AttributeCondition,
  valuesByField: Map<string, Set<unknown>>,
): boolean {
  switch (cond.operator) {
    case "and":
      return cond.conditions.every((c) =>
        isConditionFulfillable(c, valuesByField),
      );
    case "or":
      return cond.conditions.some((c) =>
        isConditionFulfillable(c, valuesByField),
      );
    case "equals": {
      const allowed = valuesByField.get(cond.field);
      // Field has no constrained value list — condition could be satisfied.
      if (!allowed) return true;
      return allowed.has(cond.value);
    }
    case "in": {
      const allowed = valuesByField.get(cond.field);
      if (!allowed) return true;
      return (
        Array.isArray(cond.value) &&
        (cond.value as unknown[]).some((v) => allowed.has(v))
      );
    }
    default: {
      const _exhaustive: never = cond;
      throw new Error(
        `Unhandled operator: ${(_exhaustive as AttributeCondition).operator}`,
      );
    }
  }
}

/**
 * Determines whether a `when` condition tree can ever be satisfied given the
 * possible values of the referenced fields in the schema.
 *
 * Used to detect attributes whose conditions are structurally unfulfillable
 * (e.g. `when: { operator: "equals", field: "category", value: "insect" }`
 * but `category` has no "insect" in its `values` list). Such attributes —
 * when also marked `required` — must be rendered unconditionally so the
 * annotator can still fill them in.
 *
 * For `"and"` trees, every branch must be independently fulfillable.
 * For `"or"` trees, at least one branch must be fulfillable.
 *
 * @param condition - The `when` root node to check.
 * @param schemaAttributes - All attribute configs for the current label schema,
 *   used to look up each referenced field's allowed values.
 * @returns `true` if the condition could be satisfied, `false` if it is
 *   structurally impossible given the schema's value constraints.
 */
export function isWhenFulfillable(
  condition: AttributeCondition | undefined,
  schemaAttributes: AttributeConfig[],
): boolean {
  if (!condition) return true;

  // Merge values from all attributes with the same name so that duplicate
  // entries (e.g. "animal_name" for "mammal" and "reptile" variants) each
  // contribute their allowed values to a single unified set. Without this,
  // the last entry would silently overwrite earlier ones, making fulfillability
  // checks order-dependent and incorrect.
  const valuesByField = new Map<string, Set<unknown>>();
  for (const attr of schemaAttributes) {
    if (attr.values && attr.values.length > 0) {
      const existing = valuesByField.get(attr.name) ?? new Set<unknown>();
      for (const v of attr.values) existing.add(v);
      valuesByField.set(attr.name, existing);
    }
  }

  return isConditionFulfillable(condition, valuesByField);
}

/**
 * Resolves which attribute entry "owns" the visible slot for a given name.
 *
 * When multiple attribute definitions share the same name, the first entry
 * whose `when` condition is satisfied wins. Unfulfillable entries always
 * pass (they are rendered unconditionally) and are considered the owner of
 * the slot regardless of current form values.
 *
 * Comparing the resolved entry before and after a form change is the correct
 * way to decide whether to clear a value: clear only when the winning entry
 * changes or disappears, not merely when one individual entry's condition
 * becomes unsatisfied.
 *
 * @param name - The attribute name to resolve.
 * @param allAttributes - All attribute configs for the current label schema.
 * @param formData - Current flat map of label field values.
 * @returns The winning `AttributeConfig`, or `undefined` if no entry is visible.
 */
export function resolveVisibleAttribute(
  name: string,
  allAttributes: AttributeConfig[],
  formData: Record<string, unknown>,
): AttributeConfig | undefined {
  return allAttributes
    .filter((a) => a.name === name && a.when)
    .find(
      (a) =>
        evaluateWhen(a.when, formData) ||
        !isWhenFulfillable(a.when, allAttributes),
    );
}
