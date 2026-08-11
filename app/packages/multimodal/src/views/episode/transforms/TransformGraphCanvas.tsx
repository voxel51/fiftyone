import {
  Button,
  FormField,
  IconName,
  Input,
  InputType,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  TransformTopologyAnalysis,
  TransformTopologySource,
} from "../../../runtime";
import type { layoutTransformTopology } from "../../../runtime/transform-topology-layout";
import styles from "./TransformGraphTile.module.css";

export type TransformGraphSelection =
  | { readonly id: string; readonly kind: "edge" }
  | { readonly id: string; readonly kind: "frame" };

interface TransformGraphCanvasProps {
  readonly analysis: TransformTopologyAnalysis;
  readonly layout: ReturnType<typeof layoutTransformTopology>;
  readonly matchingFrameIds: ReadonlySet<string>;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (selection: TransformGraphSelection) => void;
  readonly query: string;
  readonly queryActive: boolean;
  readonly selection: TransformGraphSelection | null;
}

interface FrameNodeData extends Record<string, unknown> {
  readonly dataBearing: boolean;
  readonly frameId: string;
  readonly isolated: boolean;
  readonly sourceSummary: string;
  readonly title: string;
}

interface ComponentNodeData extends Record<string, unknown> {
  readonly label: string;
}

type FrameFlowNode = Node<FrameNodeData, "transform-frame">;
type ComponentFlowNode = Node<ComponentNodeData, "transform-component">;
type TransformFlowNode = ComponentFlowNode | FrameFlowNode;
type TransformFlowEdge = Edge<Record<string, never>, "default">;

interface ComponentRect {
  readonly flowId: string;
  readonly height: number;
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 2.5;
const FIT_OPTIONS = { maxZoom: 1.25, padding: 0.08 } as const;
const NODE_TYPES = {
  "transform-component": TransformComponentNode,
  "transform-frame": TransformFrameNode,
} as const;

/** Read-only React Flow host for the observed transform topology. */
export function TransformGraphCanvas(props: TransformGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <TransformGraphCanvasContent {...props} />
    </ReactFlowProvider>
  );
}

function TransformGraphCanvasContent({
  analysis,
  layout,
  matchingFrameIds,
  onQueryChange,
  onSelect,
  query,
  queryActive,
  selection,
}: TransformGraphCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow<
    TransformFlowNode,
    TransformFlowEdge
  >();
  const connectedFrameIds = useMemo(
    () =>
      new Set(
        analysis.edges.flatMap((edge) => [
          edge.parentFrameId,
          edge.childFrameId,
        ]),
      ),
    [analysis.edges],
  );
  const frameById = useMemo(
    () => new Map(analysis.frames.map((frame) => [frame.id, frame])),
    [analysis.frames],
  );
  const componentRects = useMemo(
    () => componentBounds(analysis, layout.nodes),
    [analysis, layout.nodes],
  );
  const componentByFrame = useMemo(() => {
    const result = new Map<string, ComponentRect>();
    const rectById = new Map(
      componentRects.map((component) => [component.id, component]),
    );
    for (const component of analysis.components) {
      const rect = rectById.get(component.id);
      if (!rect) continue;
      for (const frameId of component.frameIds) result.set(frameId, rect);
    }
    return result;
  }, [analysis.components, componentRects]);
  const nodes = useMemo<TransformFlowNode[]>(() => {
    const showComponents = componentRects.length > 0;
    const groups: ComponentFlowNode[] = showComponents
      ? componentRects.map((component) => {
          const label = componentRects.length > 1 ? component.label : "";
          return {
            ariaLabel: label || "Transform component",
            ariaRole: "group",
            connectable: false,
            data: { label },
            draggable: false,
            focusable: false,
            height: component.height,
            id: component.flowId,
            position: { x: component.x, y: component.y },
            selectable: false,
            style: { height: component.height, width: component.width },
            type: "transform-component",
            width: component.width,
            zIndex: 0,
          };
        })
      : [];
    const frames: FrameFlowNode[] = layout.nodes.map((node) => {
      const frame = frameById.get(node.frameId);
      const component = componentByFrame.get(node.frameId);
      const matched = !queryActive || matchingFrameIds.has(node.frameId);
      const isolated = !connectedFrameIds.has(node.frameId);
      const selected =
        selection?.kind === "frame" && selection.id === node.frameId;
      return {
        ariaLabel: `Frame ${node.frameId}`,
        ariaRole: "button",
        className: matched ? undefined : styles.filtered,
        connectable: false,
        data: {
          dataBearing: frame?.dataBearing ?? false,
          frameId: node.frameId,
          isolated,
          sourceSummary: shortTransformSourceSummary(
            frame?.transformSources ?? [],
          ),
          title: `${node.frameId} — ${fullTransformSourceSummary(frame?.transformSources ?? [])}`,
        },
        domAttributes: {
          "data-isolated": isolated ? "true" : undefined,
        } as React.HTMLAttributes<HTMLDivElement>,
        draggable: false,
        focusable: matched,
        handles: frameHandles(node.width, node.height),
        height: node.height,
        id: frameNodeId(node.frameId),
        ...(showComponents && component
          ? {
              parentId: component.flowId,
              position: {
                x: node.x - component.x,
                y: node.y - component.y,
              },
            }
          : { position: { x: node.x, y: node.y } }),
        selectable: matched,
        selected,
        style: { height: node.height, width: node.width },
        type: "transform-frame",
        width: node.width,
        zIndex: 2,
      };
    });
    return [...groups, ...frames];
  }, [
    componentByFrame,
    componentRects,
    connectedFrameIds,
    frameById,
    layout.nodes,
    matchingFrameIds,
    queryActive,
    selection,
  ]);
  const nodePositionByFrame = useMemo(
    () => new Map(layout.nodes.map((node) => [node.frameId, node])),
    [layout.nodes],
  );
  const edges = useMemo<TransformFlowEdge[]>(
    () =>
      analysis.edges.map((edge) => {
        const matched =
          !queryActive ||
          matchingFrameIds.has(edge.parentFrameId) ||
          matchingFrameIds.has(edge.childFrameId);
        const selected = selection?.kind === "edge" && selection.id === edge.id;
        const stroke = edgeStroke(edge.kind, selected);
        const source = nodePositionByFrame.get(edge.parentFrameId);
        const target = nodePositionByFrame.get(edge.childFrameId);
        const selfEdge = edge.parentFrameId === edge.childFrameId;
        const reverse = Boolean(source && target && target.x < source.x);
        return {
          ariaLabel: `Transform edge ${edge.parentFrameId} to ${edge.childFrameId}`,
          ariaRole: "button",
          className: matched ? undefined : styles.filtered,
          focusable: matched,
          id: edge.id,
          interactionWidth: matched ? 16 : 0,
          markerEnd: {
            color: edgeMarkerColor(edge.kind, selected),
            type: MarkerType.ArrowClosed,
          },
          selectable: matched,
          selected,
          source: frameNodeId(edge.parentFrameId),
          sourceHandle: selfEdge
            ? "source-top"
            : reverse
              ? "source-left"
              : "source-right",
          style: {
            filter: selected ? `drop-shadow(0 0 4px ${stroke})` : undefined,
            opacity: matched ? 1 : 0.11,
            stroke,
            strokeDasharray: edge.kind === "static" ? "5 4" : undefined,
            strokeWidth: selected ? 3 : edge.kind === "mixed" ? 2.2 : 1.6,
          },
          target: frameNodeId(edge.childFrameId),
          targetHandle: selfEdge
            ? "target-top"
            : reverse
              ? "target-right"
              : "target-left",
          type: "default",
          zIndex: 1,
        };
      }),
    [
      analysis.edges,
      matchingFrameIds,
      nodePositionByFrame,
      queryActive,
      selection,
    ],
  );
  const fit = useCallback(() => {
    void fitView(FIT_OPTIONS);
  }, [fitView]);
  const frameIdByNodeId = useMemo(
    () =>
      new Map(
        nodes.flatMap((node) =>
          node.type === "transform-frame"
            ? [[node.id, node.data.frameId] as const]
            : [],
        ),
      ),
    [nodes],
  );
  const handleNodeChanges = useCallback(
    (changes: NodeChange<TransformFlowNode>[]) => {
      for (const change of changes) {
        if (change.type !== "select" || !change.selected) continue;
        const frameId = frameIdByNodeId.get(change.id);
        if (frameId) onSelect({ id: frameId, kind: "frame" });
      }
    },
    [frameIdByNodeId, onSelect],
  );
  const handleEdgeChanges = useCallback(
    (changes: EdgeChange<TransformFlowEdge>[]) => {
      for (const change of changes) {
        if (change.type === "select" && change.selected) {
          onSelect({ id: change.id, kind: "edge" });
        }
      }
    },
    [onSelect],
  );

  // This effect keeps every component fitted after layout or tile-size changes.
  useEffect(() => {
    fit();
    const element = canvasRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit, layout]);

  return (
    <>
      <div
        aria-label="Transform graph controls"
        className={styles.graphToolbar}
      >
        <FormField
          className={styles.searchField}
          control={
            <Input
              aria-label="Filter transform frames"
              icon={IconName.Search}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Frame name"
              size={Size.Sm}
              type={InputType.Search}
              value={query}
            />
          }
        />
        {queryActive ? (
          <Text color={TextColor.Secondary} variant={TextVariant.Xs}>
            {matchingFrameIds.size} of {analysis.frames.length}
          </Text>
        ) : null}
        <div className={styles.canvasControls}>
          <Button
            aria-label="Zoom out"
            borderless
            leadingIcon={IconName.Remove}
            onClick={() => void zoomOut({ duration: 120 })}
            size={Size.Xs}
            variant={Variant.Icon}
          />
          <Button
            aria-label="Zoom in"
            borderless
            leadingIcon={IconName.Add}
            onClick={() => void zoomIn({ duration: 120 })}
            size={Size.Xs}
            variant={Variant.Icon}
          />
          <Button
            aria-label="Fit transform graph"
            borderless
            leadingIcon={IconName.Fullscreen}
            onClick={fit}
            size={Size.Xs}
            title="Fit"
            variant={Variant.Icon}
          />
        </div>
      </div>
      <div
        className={styles.canvas}
        data-testid="transform-topology-canvas"
        ref={canvasRef}
      >
        <ReactFlow<TransformFlowNode, TransformFlowEdge>
          aria-label="Static transform topology"
          colorMode="dark"
          deleteKeyCode={null}
          edges={edges}
          edgesFocusable
          edgesReconnectable={false}
          elementsSelectable
          fitView
          fitViewOptions={FIT_OPTIONS}
          maxZoom={MAX_ZOOM}
          minZoom={MIN_ZOOM}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable
          nodeTypes={NODE_TYPES}
          onEdgesChange={handleEdgeChanges}
          onEdgeClick={(_, edge) => onSelect({ id: edge.id, kind: "edge" })}
          onInit={fit}
          onNodesChange={handleNodeChanges}
          onNodeClick={(_, node) => {
            if (node.type === "transform-frame") {
              onSelect({ id: node.data.frameId, kind: "frame" });
            }
          }}
          panOnDrag
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
        >
          <Background
            color="var(--color-content-text-muted, #8d929d)"
            gap={18}
            size={1}
            variant={BackgroundVariant.Dots}
          />
        </ReactFlow>
      </div>
    </>
  );
}

function TransformFrameNode({ data, selected }: NodeProps<FrameFlowNode>) {
  return (
    <div
      className={`${styles.flowNodeCard} ${data.dataBearing ? styles.flowDataNode : ""} ${data.isolated ? styles.flowIsolatedNode : ""} ${selected ? styles.flowSelectedNode : ""}`}
      title={data.title}
    >
      <Handle
        className={styles.flowHandle}
        id="target-left"
        isConnectable={false}
        position={Position.Left}
        type="target"
      />
      <Handle
        className={styles.flowHandle}
        id="source-left"
        isConnectable={false}
        position={Position.Left}
        type="source"
      />
      <Handle
        className={`${styles.flowHandle} ${styles.flowLoopHandle}`}
        id="source-top"
        isConnectable={false}
        position={Position.Top}
        style={{ left: "38%" }}
        type="source"
      />
      <Handle
        className={`${styles.flowHandle} ${styles.flowLoopHandle}`}
        id="target-top"
        isConnectable={false}
        position={Position.Top}
        style={{ left: "62%" }}
        type="target"
      />
      <span aria-hidden="true" className={styles.flowNodeGlyph}>
        TF
      </span>
      <span className={styles.flowNodeText}>
        <span className={styles.flowNodeKind}>Frame</span>
        <span className={styles.flowNodeLabel}>{data.frameId}</span>
        <span className={styles.flowNodeMeta}>{data.sourceSummary}</span>
      </span>
      <Handle
        className={styles.flowHandle}
        id="target-right"
        isConnectable={false}
        position={Position.Right}
        type="target"
      />
      <Handle
        className={styles.flowHandle}
        id="source-right"
        isConnectable={false}
        position={Position.Right}
        type="source"
      />
    </div>
  );
}

function TransformComponentNode({ data }: NodeProps<ComponentFlowNode>) {
  return (
    <div className={styles.flowComponent}>
      {data.label ? (
        <span className={styles.flowComponentLabel}>{data.label}</span>
      ) : null}
    </div>
  );
}

function componentBounds(
  analysis: TransformTopologyAnalysis,
  nodes: TransformGraphCanvasProps["layout"]["nodes"],
): readonly ComponentRect[] {
  const nodeByFrame = new Map(nodes.map((node) => [node.frameId, node]));
  return analysis.components.flatMap((component, index) => {
    const componentNodes = component.frameIds.flatMap((frameId) => {
      const node = nodeByFrame.get(frameId);
      return node ? [node] : [];
    });
    if (componentNodes.length === 0) return [];
    const x = Math.min(...componentNodes.map((node) => node.x)) - 16;
    const y = Math.min(...componentNodes.map((node) => node.y)) - 36;
    const right = Math.max(
      ...componentNodes.map((node) => node.x + node.width),
    );
    const bottom = Math.max(
      ...componentNodes.map((node) => node.y + node.height),
    );
    return [
      {
        flowId: `transform-component-${index}`,
        height: bottom - y + 16,
        id: component.id,
        label: `Component ${index + 1}`,
        width: right - x + 16,
        x,
        y,
      },
    ];
  });
}

function frameNodeId(frameId: string): string {
  return `transform-frame:${frameId}`;
}

function frameHandles(
  width: number,
  height: number,
): NonNullable<FrameFlowNode["handles"]> {
  const handleSize = 8;
  const y = height / 2 - handleSize / 2;
  return [
    {
      height: handleSize,
      id: "target-left",
      position: Position.Left,
      type: "target",
      width: handleSize,
      x: -handleSize / 2,
      y,
    },
    {
      height: handleSize,
      id: "source-left",
      position: Position.Left,
      type: "source",
      width: handleSize,
      x: -handleSize / 2,
      y,
    },
    {
      height: handleSize,
      id: "target-right",
      position: Position.Right,
      type: "target",
      width: handleSize,
      x: width - handleSize / 2,
      y,
    },
    {
      height: handleSize,
      id: "source-right",
      position: Position.Right,
      type: "source",
      width: handleSize,
      x: width - handleSize / 2,
      y,
    },
    {
      height: handleSize,
      id: "source-top",
      position: Position.Top,
      type: "source",
      width: handleSize,
      x: width * 0.38 - handleSize / 2,
      y: -handleSize / 2,
    },
    {
      height: handleSize,
      id: "target-top",
      position: Position.Top,
      type: "target",
      width: handleSize,
      x: width * 0.62 - handleSize / 2,
      y: -handleSize / 2,
    },
  ];
}

function edgeStroke(
  kind: "mixed" | "static" | "temporal",
  selected: boolean,
): string {
  if (selected || kind === "mixed") {
    return "var(--color-voxel-secondary, #ff8d00)";
  }
  if (kind === "temporal") return "var(--fo-palette-info-main, #4ca3ff)";
  return "var(--color-content-text-muted, #8d929d)";
}

function edgeMarkerColor(
  kind: "mixed" | "static" | "temporal",
  selected: boolean,
): string {
  if (selected || kind === "mixed") return "#ff8d00";
  return kind === "temporal" ? "#4ca3ff" : "#8d929d";
}

function shortTransformSourceSummary(
  sources: readonly TransformTopologySource[],
): string {
  if (sources.length === 0) return "transform source unknown";
  const visible = sources
    .slice(0, 2)
    .map((source) => source.sourceName.replace(/^\/+/, ""));
  const suffix =
    sources.length > visible.length ? ` +${sources.length - 2}` : "";
  const summary = `${visible.join(" + ")}${suffix}`;
  return summary.length <= 28 ? summary : `${summary.slice(0, 25)}…`;
}

function fullTransformSourceSummary(
  sources: readonly TransformTopologySource[],
): string {
  if (sources.length === 0) return "no transform source observed";
  return sources
    .map((source) => `${source.sourceName} (${source.kind})`)
    .join(", ");
}
