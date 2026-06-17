/**
 * Interaction policy for the Lighter surface: the contract a surface uses to
 * veto select/deselect gestures before they route into the engine, plus the
 * aggregation that composes several independent vetoes into one.
 *
 * The engine bridge consults a single {@link LighterInteractionPolicy}; the
 * surface builds it by combining per-concern interceptors (one tool, one
 * lock, one view mode) via {@link combineInteractionPolicies}. Neither the
 * bridge nor the aggregation carries any concern-specific knowledge — each
 * interceptor decides for itself when it applies.
 */

/**
 * A single interaction concern's veto over a select/deselect gesture. An
 * interceptor self-gates ("am I the active tool?") and returns `true` to
 * consume the gesture.
 */
export interface LighterInteractionPolicy {
  /** Return `true` to consume a select gesture before it reaches the engine. */
  interceptSelect?: (overlayId: string) => boolean;
  /** Return `true` to consume a deselect gesture (sticky-selection contexts). */
  interceptDeselect?: (overlayId: string) => boolean;
}

/**
 * Aggregate independent interceptors into one policy. Each is consulted in
 * order and the FIRST to consume the gesture wins (later ones don't run, so a
 * consumed gesture has one owner). The aggregation carries no per-concern
 * knowledge — every "does this apply?" decision lives inside the interceptor.
 */
export const combineInteractionPolicies = (
  interceptors: readonly LighterInteractionPolicy[]
): LighterInteractionPolicy => ({
  interceptSelect: (id) =>
    interceptors.some((it) => it.interceptSelect?.(id) ?? false),
  interceptDeselect: (id) =>
    interceptors.some((it) => it.interceptDeselect?.(id) ?? false),
});
