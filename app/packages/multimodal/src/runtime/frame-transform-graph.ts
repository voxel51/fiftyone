/** Deterministic topology and reachability derived from observed transforms. */
export interface EpisodeFrameGraphSummary {
  /** Bidirectional transform components, normalized and sorted by stable id. */
  readonly components: readonly (readonly string[])[];
  readonly dataBearingReachableCountsByFrameId: ReadonlyMap<string, number>;
  readonly reachableCountsByFrameId: ReadonlyMap<string, number>;
  readonly roots: readonly string[];
  readonly tfConnectedFrameIds: readonly string[];
}

/** Shared summary for a store without observed transform edges. */
export const EMPTY_EPISODE_FRAME_GRAPH_SUMMARY: EpisodeFrameGraphSummary = {
  components: [],
  dataBearingReachableCountsByFrameId: new Map(),
  reachableCountsByFrameId: new Map(),
  roots: [],
  tfConnectedFrameIds: [],
};

/** One observed parent-child relationship in the union transform topology. */
export interface EpisodeFrameGraphEdge {
  readonly childFrameId: string;
  readonly dynamic: boolean;
  readonly parentFrameId: string;
}

interface EpisodeFrameGraphTraversalEdge extends EpisodeFrameGraphEdge {
  readonly nextFrameId: string;
}

/** Trims a frame id and rejects empty identifiers. */
export function normalizeFrameId(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/** Orders frame ids by code point for deterministic runtime results. */
export function compareFrameIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Orders graph edges by parent and then child frame id. */
export function compareFrameGraphEdges(
  left: EpisodeFrameGraphEdge,
  right: EpisodeFrameGraphEdge,
): number {
  const parentOrder = compareFrameIds(left.parentFrameId, right.parentFrameId);
  return parentOrder === 0
    ? compareFrameIds(left.childFrameId, right.childFrameId)
    : parentOrder;
}

/** Selects dynamic child edges needed to materialize placement paths. */
export function dynamicChildFrameIdsForPlacement({
  dynamicChildFrameIds,
  edges,
  frameIds,
  targetFrameId,
}: {
  readonly dynamicChildFrameIds: { has(childFrameId: string): boolean };
  readonly edges: readonly EpisodeFrameGraphEdge[];
  readonly frameIds: readonly string[];
  readonly targetFrameId: string;
}): readonly string[] | null {
  const target = normalizeFrameId(targetFrameId);
  if (!target) return null;

  const adjacency = frameGraphEdgeAdjacency(edges);
  const requiredChildren = new Set<string>();
  for (const frameId of [...new Set(frameIds)].sort(compareFrameIds)) {
    const source = normalizeFrameId(frameId);
    if (!source) return null;
    if (source === target) continue;

    const path = findFrameGraphPath(adjacency, source, target);
    if (!path) return null;
    for (const edge of path) {
      // Runtime resolution gives a dynamic relationship precedence over a
      // static relationship for the same child. Preserve that invariant even
      // when the deterministic union-topology path traverses the static edge.
      if (edge.dynamic || dynamicChildFrameIds.has(edge.childFrameId)) {
        requiredChildren.add(edge.childFrameId);
      }
    }
  }

  return [...requiredChildren].sort(compareFrameIds);
}

/** Summarizes roots, components, and directed reachability for a union graph. */
export function summarizeEpisodeFrameGraph(
  edges: readonly EpisodeFrameGraphEdge[],
  dataBearingFrameIds: ReadonlySet<string>,
): EpisodeFrameGraphSummary {
  if (edges.length === 0) return EMPTY_EPISODE_FRAME_GRAPH_SUMMARY;

  const childFrameIds = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  const undirectedAdjacency = new Map<string, string[]>();
  const frameIds = new Set<string>();
  const parentFrameIds = new Set<string>();

  for (const edge of edges) {
    childFrameIds.add(edge.childFrameId);
    frameIds.add(edge.childFrameId);
    frameIds.add(edge.parentFrameId);
    parentFrameIds.add(edge.parentFrameId);
    pushAdjacency(childrenByParent, edge.parentFrameId, edge.childFrameId);
    pushAdjacency(undirectedAdjacency, edge.parentFrameId, edge.childFrameId);
    pushAdjacency(undirectedAdjacency, edge.childFrameId, edge.parentFrameId);
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareFrameIds);
  }

  const tfConnectedFrameIds = [...frameIds].sort(compareFrameIds);
  const components = connectedComponents(
    tfConnectedFrameIds,
    undirectedAdjacency,
  );
  const roots = [...parentFrameIds]
    .filter((frameId) => !childFrameIds.has(frameId))
    .sort(compareFrameIds);
  const reachableCountsByFrameId = new Map<string, number>();
  const dataBearingReachableCountsByFrameId = new Map<string, number>();

  for (const frameId of tfConnectedFrameIds) {
    const reachableFrameIds = reachableFrameIdsFrom(frameId, childrenByParent);
    reachableCountsByFrameId.set(frameId, reachableFrameIds.length);
    dataBearingReachableCountsByFrameId.set(
      frameId,
      reachableFrameIds.filter((reachableFrameId) =>
        dataBearingFrameIds.has(reachableFrameId),
      ).length,
    );
  }

  return {
    components,
    dataBearingReachableCountsByFrameId,
    reachableCountsByFrameId,
    roots,
    tfConnectedFrameIds,
  };
}

function frameGraphEdgeAdjacency(
  edges: readonly EpisodeFrameGraphEdge[],
): ReadonlyMap<string, readonly EpisodeFrameGraphTraversalEdge[]> {
  const adjacency = new Map<string, EpisodeFrameGraphTraversalEdge[]>();
  for (const edge of edges) {
    pushAdjacency(adjacency, edge.childFrameId, {
      ...edge,
      nextFrameId: edge.parentFrameId,
    });
    pushAdjacency(adjacency, edge.parentFrameId, {
      ...edge,
      nextFrameId: edge.childFrameId,
    });
  }
  for (const candidates of adjacency.values()) {
    candidates.sort((left, right) => {
      const frameOrder = compareFrameIds(left.nextFrameId, right.nextFrameId);
      if (frameOrder !== 0) return frameOrder;
      if (left.dynamic !== right.dynamic) return left.dynamic ? 1 : -1;
      return compareFrameIds(left.childFrameId, right.childFrameId);
    });
  }
  return adjacency;
}

function findFrameGraphPath(
  adjacency: ReadonlyMap<string, readonly EpisodeFrameGraphTraversalEdge[]>,
  sourceFrameId: string,
  targetFrameId: string,
): readonly EpisodeFrameGraphTraversalEdge[] | null {
  const queue = [sourceFrameId];
  const visited = new Set(queue);
  const predecessorByFrameId = new Map<
    string,
    { readonly edge: EpisodeFrameGraphTraversalEdge; readonly frameId: string }
  >();

  for (let index = 0; index < queue.length; index += 1) {
    const frameId = queue[index];
    if (!frameId) continue;
    for (const edge of adjacency.get(frameId) ?? []) {
      if (visited.has(edge.nextFrameId)) continue;
      visited.add(edge.nextFrameId);
      predecessorByFrameId.set(edge.nextFrameId, { edge, frameId });
      if (edge.nextFrameId === targetFrameId) {
        const path: EpisodeFrameGraphTraversalEdge[] = [];
        let current = targetFrameId;
        while (current !== sourceFrameId) {
          const predecessor = predecessorByFrameId.get(current);
          if (!predecessor) return null;
          path.push(predecessor.edge);
          current = predecessor.frameId;
        }
        return path.reverse();
      }
      queue.push(edge.nextFrameId);
    }
  }

  return null;
}

function connectedComponents(
  frameIds: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): readonly (readonly string[])[] {
  const components: string[][] = [];
  const visited = new Set<string>();

  for (const frameId of frameIds) {
    if (visited.has(frameId)) continue;
    const component: string[] = [];
    const stack = [frameId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      const neighbors = adjacency.get(current) ?? [];
      for (let index = neighbors.length - 1; index >= 0; index -= 1) {
        const neighbor = neighbors[index];
        if (neighbor && !visited.has(neighbor)) stack.push(neighbor);
      }
    }
    component.sort(compareFrameIds);
    components.push(component);
  }

  return components.sort((left, right) =>
    compareFrameIds(left[0] ?? "", right[0] ?? ""),
  );
}

function pushAdjacency<Value>(
  adjacency: Map<string, Value[]>,
  frameId: string,
  value: Value,
): void {
  const values = adjacency.get(frameId);
  if (values) {
    values.push(value);
  } else {
    adjacency.set(frameId, [value]);
  }
}

function reachableFrameIdsFrom(
  frameId: string,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const reachableFrameIds: string[] = [];
  const visited = new Set<string>();
  const stack = [frameId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;

    visited.add(current);
    reachableFrameIds.push(current);
    const children = childrenByParent.get(current) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childFrameId = children[index];
      if (childFrameId && !visited.has(childFrameId)) {
        stack.push(childFrameId);
      }
    }
  }

  return reachableFrameIds;
}
