import type {
  EpisodeTransformTopologyEdgeObservation,
  EpisodeTransformTopologyFrameUse,
} from "../ir";
import { compareFrameIds, normalizeFrameId } from "./frame-transform-graph";

type TransformTopologyEdgeKind = "mixed" | "static" | "temporal";

/** One transform topic that contributed relationships to an edge or frame. */
export interface TransformTopologySource {
  readonly kind: TransformTopologyEdgeKind;
  readonly sourceName: string;
  readonly sourceStreamIds: readonly string[];
}

/** One aggregate parent-child relationship presented by the debugger. */
export interface TransformTopologyEdge {
  readonly childFrameId: string;
  readonly firstObservedTimeNs?: bigint;
  readonly id: string;
  readonly kind: TransformTopologyEdgeKind;
  readonly lastObservedTimeNs?: bigint;
  readonly occurrenceCount: number;
  readonly parentFrameId: string;
  readonly sourceNames: readonly string[];
  readonly sources: readonly TransformTopologySource[];
  readonly sourceStreamIds: readonly string[];
}

/** One normalized frame and the renderable streams that use it. */
export interface TransformTopologyFrame {
  readonly dataBearing: boolean;
  readonly id: string;
  /** Renderable, non-transform topics observed using this frame. */
  readonly sourceNames: readonly string[];
  readonly streamIds: readonly string[];
  readonly transformSources: readonly TransformTopologySource[];
}

type TransformTopologyIssueKind =
  | "cycle"
  | "disconnected-components"
  | "disconnected-data"
  | "frame-name-mismatch"
  | "multiple-parents"
  | "self-edge";

/** One actionable structural diagnosis attached to topology frames. */
export interface TransformTopologyIssue {
  readonly affectedFrameIds: readonly string[];
  readonly detail: string;
  readonly id: string;
  readonly kind: TransformTopologyIssueKind;
  readonly severity: "error" | "warning";
  readonly suggestion?: string;
  readonly title: string;
}

/** One deterministic weakly-connected component in the topology. */
export interface TransformTopologyComponent {
  readonly dataBearingFrameCount: number;
  readonly edgeIds: readonly string[];
  readonly frameIds: readonly string[];
  readonly id: string;
  readonly issueIds: readonly string[];
}

/** Complete render model derived from the topology evidence acquired so far. */
export interface TransformTopologyAnalysis {
  readonly components: readonly TransformTopologyComponent[];
  readonly edges: readonly TransformTopologyEdge[];
  readonly frames: readonly TransformTopologyFrame[];
  readonly issues: readonly TransformTopologyIssue[];
  readonly summary: {
    readonly componentCount: number;
    readonly edgeCount: number;
    readonly frameCount: number;
  };
}

interface MutableEdge {
  childFrameId: string;
  firstObservedTimeNs?: bigint;
  hasStatic: boolean;
  hasTemporal: boolean;
  lastObservedTimeNs?: bigint;
  occurrenceCount: number;
  parentFrameId: string;
  sourcesByName: Map<string, MutableTransformSource>;
  sourceStreamIds: Set<string>;
}

interface MutableTransformSource {
  hasStatic: boolean;
  hasTemporal: boolean;
  sourceStreamIds: Set<string>;
}

/** Builds a deterministic, cycle-safe topology diagnostic from scan evidence. */
export function analyzeTransformTopology(
  observations: readonly EpisodeTransformTopologyEdgeObservation[],
  frameUses: readonly EpisodeTransformTopologyFrameUse[],
): TransformTopologyAnalysis {
  const edges = aggregateEdges(observations);
  const frames = aggregateFrames(edges, frameUses);
  const components = connectedComponents(frames, edges);
  const issues = diagnoseTopology({ components, edges, frames });
  const issueIdsByFrame = new Map<string, Set<string>>();
  for (const issue of issues) {
    for (const frameId of issue.affectedFrameIds) {
      const ids = issueIdsByFrame.get(frameId) ?? new Set<string>();
      ids.add(issue.id);
      issueIdsByFrame.set(frameId, ids);
    }
  }

  return {
    components: components.map((component) => ({
      ...component,
      issueIds: [
        ...new Set(
          component.frameIds.flatMap((frameId) => [
            ...(issueIdsByFrame.get(frameId) ?? []),
          ]),
        ),
      ].sort(compareFrameIds),
    })),
    edges,
    frames,
    issues,
    summary: {
      componentCount: components.length,
      edgeCount: edges.length,
      frameCount: frames.length,
    },
  };
}

function aggregateEdges(
  observations: readonly EpisodeTransformTopologyEdgeObservation[],
): readonly TransformTopologyEdge[] {
  const byRelationship = new Map<string, MutableEdge>();
  for (const observation of observations) {
    const parentFrameId = normalizeFrameId(observation.parentFrameId);
    const childFrameId = normalizeFrameId(observation.childFrameId);
    if (!parentFrameId || !childFrameId) continue;
    const key = transformTopologyEdgeId(parentFrameId, childFrameId);
    const edge = byRelationship.get(key) ?? {
      childFrameId,
      hasStatic: false,
      hasTemporal: false,
      occurrenceCount: 0,
      parentFrameId,
      sourcesByName: new Map<string, MutableTransformSource>(),
      sourceStreamIds: new Set<string>(),
    };
    edge.hasStatic ||= observation.kind === "static";
    edge.hasTemporal ||= observation.kind === "temporal";
    edge.occurrenceCount += Math.max(0, observation.occurrenceCount);
    mergeTransformSource(
      edge.sourcesByName,
      observation.sourceName,
      observation.sourceStreamId,
      observation.kind,
    );
    edge.sourceStreamIds.add(observation.sourceStreamId);
    edge.firstObservedTimeNs = minDefined(
      edge.firstObservedTimeNs,
      observation.firstObservedTimeNs,
    );
    edge.lastObservedTimeNs = maxDefined(
      edge.lastObservedTimeNs,
      observation.lastObservedTimeNs,
    );
    byRelationship.set(key, edge);
  }

  return [...byRelationship.entries()]
    .map(([id, edge]): TransformTopologyEdge => {
      const sources = finalizeTransformSources(edge.sourcesByName);
      return {
        childFrameId: edge.childFrameId,
        ...(edge.firstObservedTimeNs !== undefined
          ? { firstObservedTimeNs: edge.firstObservedTimeNs }
          : {}),
        id,
        kind:
          edge.hasStatic && edge.hasTemporal
            ? "mixed"
            : edge.hasStatic
              ? "static"
              : "temporal",
        ...(edge.lastObservedTimeNs !== undefined
          ? { lastObservedTimeNs: edge.lastObservedTimeNs }
          : {}),
        occurrenceCount: edge.occurrenceCount,
        parentFrameId: edge.parentFrameId,
        sourceNames: sources.map((source) => source.sourceName),
        sources,
        sourceStreamIds: [...edge.sourceStreamIds].sort(compareFrameIds),
      };
    })
    .sort(compareTopologyEdges);
}

function aggregateFrames(
  edges: readonly TransformTopologyEdge[],
  frameUses: readonly EpisodeTransformTopologyFrameUse[],
): readonly TransformTopologyFrame[] {
  const usesByFrame = new Map<
    string,
    { sourceNames: Set<string>; streamIds: Set<string> }
  >();
  const transformSourcesByFrame = new Map<
    string,
    Map<string, MutableTransformSource>
  >();
  const frameIds = new Set<string>();
  for (const edge of edges) {
    frameIds.add(edge.parentFrameId);
    frameIds.add(edge.childFrameId);
    for (const frameId of [edge.parentFrameId, edge.childFrameId]) {
      const sources =
        transformSourcesByFrame.get(frameId) ??
        new Map<string, MutableTransformSource>();
      for (const source of edge.sources) {
        for (const sourceStreamId of source.sourceStreamIds) {
          mergeTransformSource(
            sources,
            source.sourceName,
            sourceStreamId,
            source.kind,
          );
        }
      }
      transformSourcesByFrame.set(frameId, sources);
    }
  }
  for (const use of frameUses) {
    const frameId = normalizeFrameId(use.frameId);
    if (!frameId) continue;
    frameIds.add(frameId);
    const streams = usesByFrame.get(frameId) ?? {
      sourceNames: new Set<string>(),
      streamIds: new Set<string>(),
    };
    streams.sourceNames.add(use.sourceName);
    streams.streamIds.add(use.streamId);
    usesByFrame.set(frameId, streams);
  }
  return [...frameIds].sort(compareFrameIds).map((id) => {
    const uses = usesByFrame.get(id);
    return {
      dataBearing: uses !== undefined,
      id,
      sourceNames: [...(uses?.sourceNames ?? [])].sort(compareFrameIds),
      streamIds: [...(uses?.streamIds ?? [])].sort(compareFrameIds),
      transformSources: finalizeTransformSources(
        transformSourcesByFrame.get(id) ?? new Map(),
      ),
    };
  });
}

function mergeTransformSource(
  sources: Map<string, MutableTransformSource>,
  sourceName: string,
  sourceStreamId: string,
  kind: TransformTopologyEdgeKind,
): void {
  const source = sources.get(sourceName) ?? {
    hasStatic: false,
    hasTemporal: false,
    sourceStreamIds: new Set<string>(),
  };
  source.hasStatic ||= kind === "static" || kind === "mixed";
  source.hasTemporal ||= kind === "temporal" || kind === "mixed";
  source.sourceStreamIds.add(sourceStreamId);
  sources.set(sourceName, source);
}

function finalizeTransformSources(
  sources: ReadonlyMap<string, MutableTransformSource>,
): readonly TransformTopologySource[] {
  return [...sources]
    .sort(([left], [right]) => compareFrameIds(left, right))
    .map(([sourceName, source]) => ({
      kind:
        source.hasStatic && source.hasTemporal
          ? "mixed"
          : source.hasStatic
            ? "static"
            : "temporal",
      sourceName,
      sourceStreamIds: [...source.sourceStreamIds].sort(compareFrameIds),
    }));
}

function connectedComponents(
  frames: readonly TransformTopologyFrame[],
  edges: readonly TransformTopologyEdge[],
): readonly TransformTopologyComponent[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    push(adjacency, edge.parentFrameId, edge.childFrameId);
    push(adjacency, edge.childFrameId, edge.parentFrameId);
  }
  for (const neighbors of adjacency.values()) neighbors.sort(compareFrameIds);
  const frameIds = frames.map((frame) => frame.id);
  const dataBearing = new Set(
    frames.filter((frame) => frame.dataBearing).map((frame) => frame.id),
  );
  const components: Array<{
    edgeIds: string[];
    frameIds: string[];
    id: string;
  }> = [];
  const componentIndexByFrame = new Map<string, number>();
  const visited = new Set<string>();
  for (const frameId of frameIds) {
    if (visited.has(frameId)) continue;
    const frames: string[] = [];
    const stack = [frameId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      frames.push(current);
      const neighbors = adjacency.get(current) ?? [];
      for (let index = neighbors.length - 1; index >= 0; index -= 1) {
        const neighbor = neighbors[index];
        if (neighbor && !visited.has(neighbor)) stack.push(neighbor);
      }
    }
    frames.sort(compareFrameIds);
    const componentIndex = components.length;
    for (const frame of frames)
      componentIndexByFrame.set(frame, componentIndex);
    components.push({
      edgeIds: [],
      frameIds: frames,
      id: frames[0] ?? "component",
    });
  }
  for (const edge of edges) {
    const componentIndex = componentIndexByFrame.get(edge.parentFrameId);
    if (
      componentIndex === undefined ||
      componentIndex !== componentIndexByFrame.get(edge.childFrameId)
    ) {
      continue;
    }
    components[componentIndex]?.edgeIds.push(edge.id);
  }
  return components
    .map((component) => ({
      ...component,
      dataBearingFrameCount: component.frameIds.filter((frameId) =>
        dataBearing.has(frameId),
      ).length,
      issueIds: [],
    }))
    .sort(
      (left, right) =>
        right.dataBearingFrameCount - left.dataBearingFrameCount ||
        compareFrameIds(left.id, right.id),
    );
}

function diagnoseTopology({
  components,
  edges,
  frames,
}: {
  readonly components: readonly TransformTopologyComponent[];
  readonly edges: readonly TransformTopologyEdge[];
  readonly frames: readonly TransformTopologyFrame[];
}): readonly TransformTopologyIssue[] {
  const issues: TransformTopologyIssue[] = [];
  const componentByFrame = new Map<string, string>();
  for (const component of components) {
    for (const frameId of component.frameIds) {
      componentByFrame.set(frameId, component.id);
    }
  }
  const dataComponents = new Map<string, string[]>();
  for (const frame of frames) {
    if (!frame.dataBearing) continue;
    const componentId = componentByFrame.get(frame.id) ?? frame.id;
    push(dataComponents, componentId, frame.id);
  }
  if (dataComponents.size > 1) {
    const affectedFrameIds = [...dataComponents.values()]
      .flat()
      .sort(compareFrameIds);
    issues.push({
      affectedFrameIds,
      detail: `${dataComponents.size} disconnected transform components contain renderable streams. Those streams cannot be co-registered without another relationship.`,
      id: "disconnected-data",
      kind: "disconnected-data",
      severity: "error",
      title: "Renderable streams are disconnected",
    });
  } else if (components.length > 1) {
    issues.push({
      affectedFrameIds: components
        .flatMap((component) => component.frameIds)
        .sort(compareFrameIds),
      detail: `${components.length} disconnected transform components were observed. A connecting relationship may be missing or may not have been observed.`,
      id: "disconnected-components",
      kind: "disconnected-components",
      severity: "warning",
      title: "Transform graph is disconnected",
    });
  }

  for (const edge of edges) {
    if (edge.parentFrameId !== edge.childFrameId) continue;
    issues.push({
      affectedFrameIds: [edge.childFrameId],
      detail: `${edge.childFrameId} is declared as its own parent.`,
      id: `self-edge:${edge.id}`,
      kind: "self-edge",
      severity: "error",
      title: "Self-referential transform",
    });
  }

  const parentsByChild = new Map<string, Set<string>>();
  for (const edge of edges) {
    const parents = parentsByChild.get(edge.childFrameId) ?? new Set<string>();
    parents.add(edge.parentFrameId);
    parentsByChild.set(edge.childFrameId, parents);
  }
  for (const [child, parents] of [...parentsByChild].sort(([left], [right]) =>
    compareFrameIds(left, right),
  )) {
    if (parents.size <= 1) continue;
    const sortedParents = [...parents].sort(compareFrameIds);
    issues.push({
      affectedFrameIds: [child, ...sortedParents],
      detail: `${child} has multiple observed parents: ${sortedParents.join(", ")}.`,
      id: `multiple-parents:${child}`,
      kind: "multiple-parents",
      severity: "error",
      title: "Conflicting parent relationships",
    });
  }

  for (const cycle of directedCycles(
    frames.map((frame) => frame.id),
    edges,
  )) {
    issues.push({
      affectedFrameIds: cycle,
      detail: `Directed transforms form a cycle across ${cycle.join(" → ")}.`,
      id: `cycle:${cycle.join("\0")}`,
      kind: "cycle",
      severity: "error",
      title: "Transform cycle",
    });
  }

  const transformFrameIds = new Set(
    edges.flatMap((edge) => [edge.parentFrameId, edge.childFrameId]),
  );
  const transformFrameCandidates = [...transformFrameIds].sort(compareFrameIds);
  for (const frame of frames) {
    if (!frame.dataBearing || transformFrameIds.has(frame.id)) continue;
    const suggestion = closestFrameName(frame.id, transformFrameCandidates);
    if (!suggestion) continue;
    issues.push({
      affectedFrameIds: [frame.id, suggestion],
      detail: `${frame.id} carries data but has no exact transform relationship. ${suggestion} is only a spelling suggestion; the recording remains disconnected.`,
      id: `frame-name-mismatch:${frame.id}:${suggestion}`,
      kind: "frame-name-mismatch",
      severity: "warning",
      suggestion,
      title: "Likely frame-name mismatch",
    });
  }

  return issues.sort(compareIssues);
}

/** Returns directed strongly-connected components with a genuine cycle. */
function directedCycles(
  frameIds: readonly string[],
  edges: readonly TransformTopologyEdge[],
): readonly (readonly string[])[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.parentFrameId === edge.childFrameId) continue;
    push(adjacency, edge.parentFrameId, edge.childFrameId);
  }
  for (const children of adjacency.values()) children.sort(compareFrameIds);
  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];

  interface VisitFrame {
    readonly children: readonly string[];
    readonly frameId: string;
    readonly parent?: string;
    nextChild: number;
  }
  const enter = (frameId: string, parent?: string): VisitFrame => {
    indexes.set(frameId, nextIndex);
    lowLinks.set(frameId, nextIndex);
    nextIndex += 1;
    stack.push(frameId);
    onStack.add(frameId);
    return {
      children: adjacency.get(frameId) ?? [],
      frameId,
      nextChild: 0,
      ...(parent ? { parent } : {}),
    };
  };

  for (const root of [...frameIds].sort(compareFrameIds)) {
    if (indexes.has(root)) continue;
    const visits = [enter(root)];
    while (visits.length > 0) {
      const visit = visits[visits.length - 1];
      if (!visit) break;
      const child = visit.children[visit.nextChild];
      if (child !== undefined) {
        visit.nextChild += 1;
        if (!indexes.has(child)) {
          visits.push(enter(child, visit.frameId));
        } else if (onStack.has(child)) {
          lowLinks.set(
            visit.frameId,
            Math.min(lowLinks.get(visit.frameId) ?? 0, indexes.get(child) ?? 0),
          );
        }
        continue;
      }

      visits.pop();
      if (visit.parent) {
        lowLinks.set(
          visit.parent,
          Math.min(
            lowLinks.get(visit.parent) ?? 0,
            lowLinks.get(visit.frameId) ?? 0,
          ),
        );
      }
      if (lowLinks.get(visit.frameId) !== indexes.get(visit.frameId)) continue;
      const component: string[] = [];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) break;
        onStack.delete(current);
        component.push(current);
        if (current === visit.frameId) break;
      }
      if (component.length > 1) {
        component.sort(compareFrameIds);
        cycles.push(component);
      }
    }
  }
  return cycles.sort((left, right) =>
    compareFrameIds(left[0] ?? "", right[0] ?? ""),
  );
}

function closestFrameName(
  source: string,
  candidates: readonly string[],
): string | null {
  const canonicalSource = canonicalFrameName(source);
  const ranked = candidates
    .filter((candidate) => candidate !== source)
    .map((candidate) => ({
      candidate,
      distance: levenshtein(canonicalSource, canonicalFrameName(candidate)),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        compareFrameIds(left.candidate, right.candidate),
    );
  const best = ranked[0];
  if (!best) return null;
  const threshold = canonicalSource.length >= 12 ? 2 : 1;
  return best.distance <= threshold ? best.candidate : null;
}

function canonicalFrameName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex] ?? 0;
      previous[rightIndex] = Math.min(
        above + 1,
        (previous[rightIndex - 1] ?? 0) + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length] ?? 0;
}

function compareTopologyEdges(
  left: TransformTopologyEdge,
  right: TransformTopologyEdge,
): number {
  const parent = compareFrameIds(left.parentFrameId, right.parentFrameId);
  return parent || compareFrameIds(left.childFrameId, right.childFrameId);
}

function compareIssues(
  left: TransformTopologyIssue,
  right: TransformTopologyIssue,
): number {
  if (left.severity !== right.severity)
    return left.severity === "error" ? -1 : 1;
  return compareFrameIds(left.id, right.id);
}

function transformTopologyEdgeId(
  parentFrameId: string,
  childFrameId: string,
): string {
  return `${parentFrameId}\0${childFrameId}`;
}

function minDefined(
  left: bigint | undefined,
  right: bigint | undefined,
): bigint | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left < right ? left : right;
}

function maxDefined(
  left: bigint | undefined,
  right: bigint | undefined,
): bigint | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left > right ? left : right;
}

function push<Value>(
  map: Map<string, Value[]>,
  key: string,
  value: Value,
): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}
