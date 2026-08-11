import { compareFrameIds } from "./frame-transform-graph";
import type {
  TransformTopologyAnalysis,
  TransformTopologyEdge,
} from "./transform-topology";

interface TransformTopologyLayoutNode {
  readonly frameId: string;
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

interface TransformTopologyLayout {
  readonly bounds: {
    readonly height: number;
    readonly width: number;
  };
  readonly nodes: readonly TransformTopologyLayoutNode[];
}

const NODE_WIDTH = 196;
const NODE_HEIGHT = 58;
const COLUMN_GAP = 100;
const ROW_GAP = 28;
const COMPONENT_GAP = 88;
const PADDING = 32;

/** Deterministic spanning-tree layout that retains non-tree and cyclic edges. */
export function layoutTransformTopology(
  analysis: TransformTopologyAnalysis,
): TransformTopologyLayout {
  const edgeById = new Map(analysis.edges.map((edge) => [edge.id, edge]));
  const nodes: TransformTopologyLayoutNode[] = [];
  let componentTop = PADDING;
  for (const component of analysis.components) {
    const componentEdges = component.edgeIds.flatMap((id) => {
      const edge = edgeById.get(id);
      return edge ? [edge] : [];
    });
    const levels = componentLevels(component.frameIds, componentEdges);
    const framesByLevel = new Map<number, string[]>();
    for (const frameId of component.frameIds) {
      const level = levels.get(frameId) ?? 0;
      const frames = framesByLevel.get(level) ?? [];
      frames.push(frameId);
      framesByLevel.set(level, frames);
    }
    let maxRows = 1;
    for (const frames of framesByLevel.values()) {
      frames.sort(compareFrameIds);
      maxRows = Math.max(maxRows, frames.length);
    }
    const componentHeight =
      maxRows * NODE_HEIGHT + Math.max(0, maxRows - 1) * ROW_GAP;
    const sortedLevels = [...framesByLevel].sort(
      ([left], [right]) => left - right,
    );
    for (const [level, frames] of sortedLevels) {
      const columnHeight =
        frames.length * NODE_HEIGHT + Math.max(0, frames.length - 1) * ROW_GAP;
      const columnTop = componentTop + (componentHeight - columnHeight) / 2;
      frames.forEach((frameId, row) => {
        nodes.push({
          frameId,
          height: NODE_HEIGHT,
          width: NODE_WIDTH,
          x: PADDING + level * (NODE_WIDTH + COLUMN_GAP),
          y: columnTop + row * (NODE_HEIGHT + ROW_GAP),
        });
      });
    }
    componentTop += componentHeight + COMPONENT_GAP;
  }
  let width = 1;
  let height = 1;
  for (const node of nodes) {
    width = Math.max(width, node.x + node.width + PADDING);
    height = Math.max(height, node.y + node.height + PADDING);
  }
  return { bounds: { height, width }, nodes };
}

function componentLevels(
  frameIds: readonly string[],
  edges: readonly TransformTopologyEdge[],
): ReadonlyMap<string, number> {
  const parents = new Set(edges.map((edge) => edge.parentFrameId));
  const children = new Set(edges.map((edge) => edge.childFrameId));
  const roots = frameIds
    .filter((frameId) => parents.has(frameId) && !children.has(frameId))
    .sort(compareFrameIds);
  const queue =
    roots.length > 0 ? [...roots] : [...frameIds].sort(compareFrameIds);
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const next = adjacency.get(edge.parentFrameId) ?? [];
    next.push(edge.childFrameId);
    adjacency.set(edge.parentFrameId, next);
  }
  for (const values of adjacency.values()) values.sort(compareFrameIds);
  const levels = new Map<string, number>();
  for (const root of queue) {
    if (!levels.has(root)) levels.set(root, 0);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) continue;
    const level = levels.get(current) ?? 0;
    for (const child of adjacency.get(current) ?? []) {
      if (levels.has(child)) continue;
      levels.set(child, level + 1);
      queue.push(child);
    }
  }
  // Directed cycles and reversed islands remain visible in a stable column.
  for (const frameId of [...frameIds].sort(compareFrameIds)) {
    if (!levels.has(frameId)) levels.set(frameId, 0);
  }
  return levels;
}
