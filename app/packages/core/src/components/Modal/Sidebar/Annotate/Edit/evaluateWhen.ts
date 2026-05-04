import type {
  AttributeCondition,
  AttributeConfig,
} from "../SchemaManager/utils";

/**
 * Handler signature for a single operator.
 *
 * @param fieldValue - The current value of the referenced field.
 * @param condValue  - The value (or array of values) declared in the condition.
 *
 * Note: comparison assumes primitive values. If condValue or fieldValue could
 * be objects, we'll need to implement a deep-equality check.
 */
type OperatorHandler = (fieldValue: unknown, condValue: unknown) => boolean;

/**
 * Typed map of every supported `when` operator to its evaluation logic.
 *
 * Using `Record<AttributeCondition["operator"], ...>` means TypeScript will
 * produce a compile error here if a new operator is added to the union without
 * a corresponding handler — ensuring no operator is silently unhandled at
 * runtime.
 */
const OPERATOR_HANDLERS: Record<
  AttributeCondition["operator"],
  OperatorHandler
> = {
  equals: (fieldValue, condValue) => fieldValue === condValue,
  in: (fieldValue, condValue) =>
    Array.isArray(condValue) && condValue.includes(fieldValue),
};

/**
 * Evaluates a set of `when` conditions against the current label field values.
 *
 * Visibility semantics: an attribute is visible if ANY of its conditions are
 * satisfied (OR logic), matching the preview logic in the Schema Manager.
 *
 * @param conditions - The `when` array from an attribute definition, or
 *   undefined/empty for unconditionally-visible attributes.
 * @param currentValues - Flat map of the label's current field values
 *   (e.g. `{ label: "dog", category: "mammal" }`).
 * @returns `true` if the attribute should be shown, `false` if it should be
 *   hidden.
 */
export function evaluateWhen(
  conditions: AttributeCondition[] | undefined,
  currentValues: Record<string, unknown>
): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.some((cond) => {
    const handler = OPERATOR_HANDLERS[cond.operator];
    return handler(currentValues[cond.field], cond.value);
  });
}

/**
 * Determines whether a set of `when` conditions can ever be satisfied given
 * the possible values of the referenced fields in the schema.
 *
 * Used to detect attributes whose conditions are structurally unfulfillable
 * (e.g. `when: [{ field: "category", operator: "equals", value: "insect" }]`
 * but `category` has no "insect" in its `values` list). Such attributes —
 * when also marked `required` — must be rendered unconditionally so the
 * annotator can still fill them in.
 *
 * @param conditions - The `when` conditions to check.
 * @param schemaAttributes - All attribute configs for the current label schema,
 *   used to look up each referenced field's allowed values.
 * @returns `true` if at least one condition could be satisfied, `false` if
 *   every condition references a value that isn't in the field's value list.
 */
export function isWhenFulfillable(
  conditions: AttributeCondition[] | undefined,
  schemaAttributes: AttributeConfig[]
): boolean {
  if (!conditions || conditions.length === 0) return true;

  const valuesByField = new Map<string, Set<unknown>>();
  for (const attr of schemaAttributes) {
    if (attr.values && attr.values.length > 0) {
      valuesByField.set(attr.name, new Set(attr.values));
    }
  }

  return conditions.some((cond) => {
    const allowed = valuesByField.get(cond.field);
    if (!allowed) {
      // Field has no constrained value list — condition could be satisfied.
      return true;
    }

    // Reuse the same operator handlers, but against the set of allowed values
    switch (cond.operator) {
      case "equals":
        return allowed.has(cond.value);
      case "in":
        return (
          Array.isArray(cond.value) &&
          (cond.value as unknown[]).some((v) => allowed.has(v))
        );
    }
  });
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
  formData: Record<string, unknown>
): AttributeConfig | undefined {
  return allAttributes
    .filter((a) => a.name === name && a.when)
    .find(
      (a) =>
        evaluateWhen(a.when, formData) ||
        !isWhenFulfillable(a.when, allAttributes)
    );
}
