import type { LabelFieldDelta } from "../deltas";

/**
 * A function which provides captured annotation deltas (the original value and
 * the updated value for each edited label/field) when called.
 */
export type DeltaSupplier = () => { deltas: LabelFieldDelta[] };
