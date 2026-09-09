import {
  compareFrameIds,
  uniqueSortedFrameIds,
} from "../../../../utils/frame-ids";
import type { EpisodeFrameTransformStore } from "../../../../runtime/frame-transforms";

/** Frame sources that one placement consumer resolves into a target frame. */
export interface FramePlacementScope {
  readonly frameIds: readonly string[];
  readonly targetFrameId: string;
}

/** Owns normalized placement scopes and idempotent registration disposal. */
export class FramePlacementScopeRegistry {
  readonly #scopes = new Map<symbol, FramePlacementScope>();

  register(scope: FramePlacementScope): (() => boolean) | null {
    const normalized = normalizePlacementScope(scope);
    if (!normalized) return null;

    const token = Symbol("frame-placement-scope");
    this.#scopes.set(token, normalized);
    return () => this.#scopes.delete(token);
  }

  values(additional?: FramePlacementScope): readonly FramePlacementScope[] {
    return normalizedPlacementScopes([
      ...this.#scopes.values(),
      ...(additional ? [additional] : []),
    ]);
  }
}

/** Trims and canonicalizes one placement scope. */
export function normalizePlacementScope(
  scope: FramePlacementScope,
): FramePlacementScope | null {
  const targetFrameId = scope.targetFrameId.trim();
  const frameIds = uniqueSortedFrameIds(scope.frameIds).filter(
    (frameId) => frameId !== targetFrameId,
  );
  return !targetFrameId || frameIds.length === 0
    ? null
    : { frameIds, targetFrameId };
}

/** Deduplicates normalized scopes without changing first-registration order. */
export function normalizedPlacementScopes(
  scopes: readonly FramePlacementScope[],
): readonly FramePlacementScope[] {
  const scopesByKey = new Map<string, FramePlacementScope>();
  for (const scope of scopes) {
    const normalized = normalizePlacementScope(scope);
    if (!normalized) continue;
    scopesByKey.set(
      `${normalized.targetFrameId}\0${normalized.frameIds.join("\0")}`,
      normalized,
    );
  }
  return [...scopesByKey.values()];
}

/** Resolves dynamic child ids needed by every registered placement scope. */
export function dynamicChildrenForPlacementScopes(
  store: EpisodeFrameTransformStore,
  scopes: readonly FramePlacementScope[],
): readonly string[] | null {
  if (scopes.length === 0) return null;
  const children = new Set<string>();
  for (const scope of scopes) {
    const scoped = store.dynamicChildFrameIdsForPlacement(scope);
    if (!scoped) return null;
    for (const childFrameId of scoped) children.add(childFrameId);
  }
  return [...children].sort(compareFrameIds);
}

/** Whether every requested source resolves into its scope target at a time. */
export function placementScopesResolve(
  store: EpisodeFrameTransformStore | null,
  scopes: readonly FramePlacementScope[],
  timeNs: bigint,
  boundaryClampNs: bigint | undefined,
): boolean {
  if (!store || scopes.length === 0) return false;
  return scopes.every((scope) =>
    scope.frameIds.every(
      (sourceFrameId) =>
        store.resolve({
          ...(boundaryClampNs === undefined
            ? {}
            : { policy: { boundaryClampNs } }),
          sourceFrameId,
          targetFrameId: scope.targetFrameId,
          timeNs,
        }).status === "resolved",
    ),
  );
}
