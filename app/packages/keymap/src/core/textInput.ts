/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The one text-editing guard. The design doc's F4 found this reimplemented at
 * least eight different ways and absent from ten more handlers — which is how
 * typing "s" into a sidebar filter ends up switching the embeddings plot into
 * lasso mode. This is the strongest of those variants (promoted from
 * `CommandContextManager.ts:41-55`), and in this POC it is consulted in exactly
 * one place: the registry's dispatch.
 */

/**
 * Input types that don't capture general typing. Commands stay active on these
 * so a bound key (e.g. Space for play/pause) wins over native activation of a
 * focused checkbox/button. Types with richer native keyboard models (text,
 * radio, range, date, …) keep native-first behavior.
 */
const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "reset", "submit"]);

/** True when the element consumes general keystrokes for editing/navigation. */
export const isTextEditingTarget = (el: Element | null): boolean => {
  if (!el) {
    return false;
  }
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
    return true;
  }
  if (el.tagName === "INPUT") {
    return !NON_TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
};

/** Uses `activeElement`, not `event.target`, which is where several of the
 * existing variants go wrong. */
export const isEditingActiveElement = (): boolean =>
  typeof document !== "undefined" &&
  isTextEditingTarget(document.activeElement);
