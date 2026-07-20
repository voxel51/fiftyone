import type { EpisodeComposedFrameTransform } from "../../runtime/frame-transform-types";
import type { EpisodeFrameGraphSummary } from "../../runtime/frame-transforms";

const STABLE_REFERENCE_FRAME_IDS = ["map", "world", "odom"] as const;
const EGO_FRAME_IDS = ["base_link", "ego_vehicle", "ego", "vehicle"] as const;

/** Provenance of the current automatic or explicit reference-frame choice. */
export type EpisodeReferenceSelectionSource =
  | "auto-local"
  | "auto-stable"
  | "user";

/** Coordinate frames observed for one selected source. */
export interface EpisodeFrameObservation {
  readonly frameIds: readonly string[];
  readonly sourceId: string;
}

/** Normalized inputs that determine a reference-frame decision. */
export interface EpisodeReferenceFacts {
  readonly graphSummary: EpisodeFrameGraphSummary;
  readonly observations: readonly EpisodeFrameObservation[];
  readonly primarySourceId: string | null;
  readonly revisionKey: string;
}

/** Deterministic active-component and reference-frame selection. */
export interface EpisodeReferenceDecision {
  readonly activeComponentFrameIds: readonly string[];
  readonly activeComponentId: string;
  readonly omittedFrameIds: readonly string[];
  readonly omittedSourceIds: readonly string[];
  readonly primaryAnchorFrameId: string;
  readonly referenceFrameId: string;
  readonly source: EpisodeReferenceSelectionSource;
}

/** A topology-backed local-to-stable transition awaiting placement readiness. */
export interface EpisodeReferencePromotion {
  readonly candidateFrameId: string;
  readonly componentId: string;
  readonly frameIds: readonly string[];
  readonly key: string;
  readonly primaryAnchorFrameId: string;
  readonly sourceFrameId: string;
  readonly timeNs?: bigint;
}

/** Exact transform committed by a guarded automatic reference promotion. */
export interface EpisodeReferenceTransition {
  readonly key: string;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
  readonly transform: EpisodeComposedFrameTransform;
}

/** Durable state for automatic selection, explicit intent, and promotion gating. */
export interface EpisodeReferenceSelectionState {
  readonly blockedPromotionKey: string | null;
  readonly committedTransition: EpisodeReferenceTransition | null;
  readonly decision: EpisodeReferenceDecision;
  readonly facts: EpisodeReferenceFacts;
  readonly pendingPromotion: EpisodeReferencePromotion | null;
  /** Sticky explicit intent; the rendered decision may temporarily fall back. */
  readonly userReferenceFrameId: string | null;
}

/** Events accepted by the pure reference-frame selection reducer. */
export type EpisodeReferenceSelectionAction =
  | {
      readonly facts: EpisodeReferenceFacts;
      readonly timeNs?: bigint;
      readonly type: "factsChanged";
    }
  | {
      readonly frameId: string;
      readonly type: "userReferenceSelected";
    }
  | { readonly key: string; readonly type: "promotionRejected" }
  | {
      readonly key: string;
      readonly transform: EpisodeComposedFrameTransform;
      readonly type: "promotionResolved";
    }
  | { readonly type: "useRecommendedReference" };

const EMPTY_DECISION: EpisodeReferenceDecision = {
  activeComponentFrameIds: [],
  activeComponentId: "",
  omittedFrameIds: [],
  omittedSourceIds: [],
  primaryAnchorFrameId: "",
  referenceFrameId: "",
  source: "auto-local",
};

/** Creates reference selection state from the first available facts. */
export function createEpisodeReferenceSelectionState(
  facts: EpisodeReferenceFacts,
): EpisodeReferenceSelectionState {
  return {
    blockedPromotionKey: null,
    committedTransition: null,
    decision: deriveEpisodeReferenceDecision(facts),
    facts,
    pendingPromotion: null,
    userReferenceFrameId: null,
  };
}

/** Pure state machine for reference selection and guarded local→stable promotion. */
export function episodeReferenceSelectionReducer(
  state: EpisodeReferenceSelectionState,
  action: EpisodeReferenceSelectionAction,
): EpisodeReferenceSelectionState {
  switch (action.type) {
    case "userReferenceSelected": {
      const decision = deriveEpisodeReferenceDecision(
        state.facts,
        action.frameId,
      );
      if (decision.source !== "user") return state;
      return {
        ...state,
        blockedPromotionKey: null,
        committedTransition: null,
        decision,
        pendingPromotion: null,
        userReferenceFrameId: action.frameId,
      };
    }
    case "useRecommendedReference":
      return {
        ...state,
        blockedPromotionKey: null,
        committedTransition: null,
        decision: deriveEpisodeReferenceDecision(state.facts),
        pendingPromotion: null,
        userReferenceFrameId: null,
      };
    case "promotionRejected":
      if (state.pendingPromotion?.key !== action.key) return state;
      return {
        ...state,
        blockedPromotionKey: action.key,
        committedTransition: null,
        pendingPromotion: null,
      };
    case "promotionResolved": {
      const pending = state.pendingPromotion;
      if (!pending || pending.key !== action.key) return state;
      if (state.decision.source === "user") return state;
      const recommended = deriveEpisodeReferenceDecision(state.facts);
      if (
        recommended.referenceFrameId !== pending.candidateFrameId ||
        recommended.activeComponentId !== pending.componentId
      ) {
        return { ...state, pendingPromotion: null };
      }
      if (
        action.transform.sourceFrameId !== pending.sourceFrameId ||
        action.transform.targetFrameId !== pending.candidateFrameId
      ) {
        return state;
      }
      return {
        ...state,
        blockedPromotionKey: null,
        committedTransition: {
          key: pending.key,
          sourceFrameId: pending.sourceFrameId,
          targetFrameId: pending.candidateFrameId,
          transform: action.transform,
        },
        decision: recommended,
        pendingPromotion: null,
      };
    }
    case "factsChanged": {
      if (
        !hasObservedFrames(action.facts.observations) &&
        state.userReferenceFrameId === null
      ) {
        return {
          ...state,
          blockedPromotionKey: null,
          committedTransition: null,
          facts: action.facts,
          pendingPromotion: null,
        };
      }
      const recommended = deriveEpisodeReferenceDecision(
        action.facts,
        state.userReferenceFrameId ?? undefined,
      );
      if (recommended.source === "user") {
        return {
          blockedPromotionKey: null,
          committedTransition: null,
          decision: recommended,
          facts: action.facts,
          pendingPromotion: null,
          userReferenceFrameId: state.userReferenceFrameId,
        };
      }

      const promotion = pendingPromotionFor({
        current: state.decision,
        facts: action.facts,
        recommended,
        timeNs: action.timeNs,
      });
      const blockedPromotionKey =
        state.facts.revisionKey === action.facts.revisionKey
          ? state.blockedPromotionKey
          : null;
      if (promotion && promotion.key !== blockedPromotionKey) {
        return {
          blockedPromotionKey,
          committedTransition: null,
          decision: keepLocalReference(recommended, state.decision),
          facts: action.facts,
          pendingPromotion: promotion,
          userReferenceFrameId: state.userReferenceFrameId,
        };
      }
      return {
        blockedPromotionKey,
        committedTransition: null,
        decision: recommended,
        facts: action.facts,
        pendingPromotion: null,
        userReferenceFrameId: state.userReferenceFrameId,
      };
    }
  }
}

/** Derives the active component and reference frame from normalized scene facts. */
export function deriveEpisodeReferenceDecision(
  facts: EpisodeReferenceFacts,
  userReferenceFrameId?: string,
): EpisodeReferenceDecision {
  const observations = normalizeObservations(facts.observations);
  const observedFrameIds = uniqueSorted(
    observations.flatMap((observation) => observation.frameIds),
  );
  const components = componentsIncludingIsolatedData(
    facts.graphSummary.components,
    observedFrameIds,
  );
  if (components.length === 0) return EMPTY_DECISION;
  if (
    observations.length === 0 &&
    !components.some((component) =>
      component.includes(userReferenceFrameId ?? ""),
    )
  ) {
    return EMPTY_DECISION;
  }

  const component = chooseActiveComponent({
    components,
    graphSummary: facts.graphSummary,
    observations,
    primarySourceId: facts.primarySourceId,
    userReferenceFrameId,
  });
  if (!component) return EMPTY_DECISION;
  const componentSet = new Set(component);
  const primaryAnchorFrameId = choosePrimaryAnchor({
    component,
    observations,
    primarySourceId: facts.primarySourceId,
  });
  const userReferenceAvailable =
    userReferenceFrameId !== undefined &&
    componentSet.has(userReferenceFrameId);
  const stableReferenceFrameId = chooseStableReference(component);
  const referenceFrameId = userReferenceAvailable
    ? userReferenceFrameId
    : stableReferenceFrameId ||
      chooseGraphRoot(component, facts.graphSummary) ||
      choosePreferredFrame(component, EGO_FRAME_IDS) ||
      primaryAnchorFrameId ||
      firstNonOptical(component);
  const allFrameIds = uniqueSorted(
    components.flatMap((candidate) => candidate),
  );

  return {
    activeComponentFrameIds: component,
    activeComponentId: component[0] ?? "",
    omittedFrameIds: allFrameIds.filter(
      (frameId) => !componentSet.has(frameId),
    ),
    omittedSourceIds: observations
      .filter((observation) =>
        observation.frameIds.every((frameId) => !componentSet.has(frameId)),
      )
      .map((observation) => observation.sourceId),
    primaryAnchorFrameId,
    referenceFrameId,
    source: userReferenceAvailable
      ? "user"
      : stableReferenceFrameId === referenceFrameId
        ? "auto-stable"
        : "auto-local",
  };
}

/** Chooses an ego target inside the active component, or its reference frame. */
export function chooseEpisodeCameraTarget(
  activeComponentFrameIds: readonly string[],
  referenceFrameId: string,
): string {
  return (
    choosePreferredFrame(activeComponentFrameIds, EGO_FRAME_IDS) ||
    (activeComponentFrameIds.includes(referenceFrameId) ? referenceFrameId : "")
  );
}

function pendingPromotionFor({
  current,
  facts,
  recommended,
  timeNs,
}: {
  readonly current: EpisodeReferenceDecision;
  readonly facts: EpisodeReferenceFacts;
  readonly recommended: EpisodeReferenceDecision;
  readonly timeNs?: bigint;
}): EpisodeReferencePromotion | null {
  if (
    current.source !== "auto-local" ||
    !current.referenceFrameId ||
    recommended.source !== "auto-stable" ||
    recommended.referenceFrameId === current.referenceFrameId ||
    !recommended.activeComponentFrameIds.includes(current.referenceFrameId)
  ) {
    return null;
  }
  const timeKey = timeNs === undefined ? "static" : timeNs.toString();
  const key = [
    facts.revisionKey,
    recommended.activeComponentId,
    recommended.primaryAnchorFrameId,
    recommended.referenceFrameId,
    timeKey,
  ].join("\0");
  return {
    candidateFrameId: recommended.referenceFrameId,
    componentId: recommended.activeComponentId,
    frameIds: [current.referenceFrameId],
    key,
    primaryAnchorFrameId: recommended.primaryAnchorFrameId,
    sourceFrameId: current.referenceFrameId,
    ...(timeNs === undefined ? {} : { timeNs }),
  };
}

function keepLocalReference(
  recommended: EpisodeReferenceDecision,
  current: EpisodeReferenceDecision,
): EpisodeReferenceDecision {
  return {
    ...recommended,
    referenceFrameId: current.referenceFrameId,
    source: "auto-local",
  };
}

function chooseActiveComponent({
  components,
  graphSummary,
  observations,
  primarySourceId,
  userReferenceFrameId,
}: {
  readonly components: readonly (readonly string[])[];
  readonly graphSummary: EpisodeFrameGraphSummary;
  readonly observations: readonly EpisodeFrameObservation[];
  readonly primarySourceId: string | null;
  readonly userReferenceFrameId?: string;
}): readonly string[] | null {
  if (userReferenceFrameId) {
    const userComponent = components.find((component) =>
      component.includes(userReferenceFrameId),
    );
    if (userComponent) return userComponent;
  }

  const componentByFrameId = componentIndex(components);
  const primaryObservation = observations.find(
    (observation) => observation.sourceId === primarySourceId,
  );
  const primaryCounts = countFramesByComponent(
    primaryObservation?.frameIds ?? [],
    componentByFrameId,
  );
  const primaryComponent = highestCountComponent(components, primaryCounts);
  if (
    primaryComponent &&
    (primaryCounts.get(primaryComponent[0] ?? "") ?? 0) > 0
  ) {
    return primaryComponent;
  }

  const memberships = new Map<string, number>();
  for (const observation of observations) {
    const componentIds = new Set(
      observation.frameIds
        .map((frameId) => componentByFrameId.get(frameId)?.[0])
        .filter((id): id is string => Boolean(id)),
    );
    for (const componentId of componentIds) {
      memberships.set(componentId, (memberships.get(componentId) ?? 0) + 1);
    }
  }
  const observedComponent = highestCountComponent(components, memberships);
  if (
    observedComponent &&
    (memberships.get(observedComponent[0] ?? "") ?? 0) > 0
  ) {
    return observedComponent;
  }

  return (
    [...components].sort((left, right) => {
      const leftStable = chooseStableReference(left) ? 1 : 0;
      const rightStable = chooseStableReference(right) ? 1 : 0;
      if (leftStable !== rightStable) return rightStable - leftStable;
      const leftRoot = chooseGraphRoot(left, graphSummary) ? 1 : 0;
      const rightRoot = chooseGraphRoot(right, graphSummary) ? 1 : 0;
      return leftRoot !== rightRoot
        ? rightRoot - leftRoot
        : compareFrameIds(left[0] ?? "", right[0] ?? "");
    })[0] ?? null
  );
}

function choosePrimaryAnchor({
  component,
  observations,
  primarySourceId,
}: {
  readonly component: readonly string[];
  readonly observations: readonly EpisodeFrameObservation[];
  readonly primarySourceId: string | null;
}): string {
  const componentSet = new Set(component);
  const primaryFrames = observations
    .find((observation) => observation.sourceId === primarySourceId)
    ?.frameIds.filter((frameId) => componentSet.has(frameId));
  return firstNonOptical(
    primaryFrames && primaryFrames.length > 0
      ? primaryFrames
      : observations.flatMap((observation) =>
          observation.frameIds.filter((frameId) => componentSet.has(frameId)),
        ),
  );
}

function chooseStableReference(frameIds: readonly string[]): string {
  return choosePreferredFrame(frameIds, STABLE_REFERENCE_FRAME_IDS);
}

function choosePreferredFrame(
  frameIds: readonly string[],
  preferredFrameIds: readonly string[],
): string {
  for (const preferred of preferredFrameIds) {
    if (frameIds.includes(preferred)) return preferred;
  }
  for (const preferred of preferredFrameIds) {
    const suffix = `/${preferred}`;
    const matches = frameIds.filter((frameId) => frameId.endsWith(suffix));
    if (matches.length === 1) return matches[0] ?? "";
  }
  return "";
}

function chooseGraphRoot(
  component: readonly string[],
  summary: EpisodeFrameGraphSummary,
): string {
  const componentSet = new Set(component);
  return (
    [...summary.roots]
      .filter((frameId) => componentSet.has(frameId))
      .sort((left, right) => {
        const dataOrder =
          (summary.dataBearingReachableCountsByFrameId.get(right) ?? 0) -
          (summary.dataBearingReachableCountsByFrameId.get(left) ?? 0);
        if (dataOrder !== 0) return dataOrder;
        const reachabilityOrder =
          (summary.reachableCountsByFrameId.get(right) ?? 0) -
          (summary.reachableCountsByFrameId.get(left) ?? 0);
        return reachabilityOrder !== 0
          ? reachabilityOrder
          : compareFrameIds(left, right);
      })[0] ?? ""
  );
}

function countFramesByComponent(
  frameIds: readonly string[],
  componentByFrameId: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const frameId of new Set(frameIds)) {
    const componentId = componentByFrameId.get(frameId)?.[0];
    if (componentId)
      counts.set(componentId, (counts.get(componentId) ?? 0) + 1);
  }
  return counts;
}

function highestCountComponent(
  components: readonly (readonly string[])[],
  counts: ReadonlyMap<string, number>,
): readonly string[] | null {
  return (
    [...components].sort((left, right) => {
      const countOrder =
        (counts.get(right[0] ?? "") ?? 0) - (counts.get(left[0] ?? "") ?? 0);
      return countOrder !== 0
        ? countOrder
        : compareFrameIds(left[0] ?? "", right[0] ?? "");
    })[0] ?? null
  );
}

function componentIndex(
  components: readonly (readonly string[])[],
): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, readonly string[]>();
  for (const component of components) {
    for (const frameId of component) result.set(frameId, component);
  }
  return result;
}

function componentsIncludingIsolatedData(
  graphComponents: readonly (readonly string[])[],
  observedFrameIds: readonly string[],
): readonly (readonly string[])[] {
  const components = graphComponents.map(uniqueSorted);
  const graphFrameIds = new Set(components.flatMap((component) => component));
  for (const frameId of observedFrameIds) {
    if (!graphFrameIds.has(frameId)) components.push([frameId]);
  }
  return components.sort((left, right) =>
    compareFrameIds(left[0] ?? "", right[0] ?? ""),
  );
}

function normalizeObservations(
  observations: readonly EpisodeFrameObservation[],
): readonly EpisodeFrameObservation[] {
  const frameIdsBySourceId = new Map<string, string[]>();
  for (const observation of observations) {
    const sourceId = observation.sourceId.trim();
    if (!sourceId) continue;
    const frameIds = frameIdsBySourceId.get(sourceId) ?? [];
    frameIds.push(...observation.frameIds);
    frameIdsBySourceId.set(sourceId, frameIds);
  }
  return [...frameIdsBySourceId]
    .map(([sourceId, frameIds]) => ({
      frameIds: uniqueSorted(frameIds),
      sourceId,
    }))
    .filter((observation) => observation.frameIds.length > 0)
    .sort((left, right) => compareFrameIds(left.sourceId, right.sourceId));
}

function hasObservedFrames(
  observations: readonly EpisodeFrameObservation[],
): boolean {
  return observations.some((observation) =>
    observation.frameIds.some((frameId) => frameId.trim().length > 0),
  );
}

function firstNonOptical(frameIds: readonly string[]): string {
  const sorted = uniqueSorted(frameIds);
  return (
    sorted.find((frameId) => !frameId.toLowerCase().includes("optical")) ??
    sorted[0] ??
    ""
  );
}

function uniqueSorted(frameIds: readonly string[]): readonly string[] {
  return [...new Set(frameIds.map((id) => id.trim()).filter(Boolean))].sort(
    compareFrameIds,
  );
}

function compareFrameIds(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
