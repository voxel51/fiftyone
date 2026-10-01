import {
  Align,
  BorderColor,
  BrandColor,
  Button,
  Card,
  CardBackground,
  borderColorClass,
  FormField,
  getColorCssVar,
  Icon,
  IconColor,
  IconName,
  Input,
  InputType,
  Justify,
  Orientation,
  Size,
  Spacing,
  Stack,
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
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  TransformTopologyAnalysis,
  TransformTopologySource,
} from "../../../runtime";
import type { layoutTransformTopology } from "../../../runtime/transform-topology-layout";
import styles from "./TransformGraphCanvas.module.css";

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
const ACTIVE_EDGE_COLOR = `var(${getColorCssVar(BrandColor.Primary)})`;
const GRID_DOT_COLOR = `var(${getColorCssVar(IconColor.Muted)})`;
const STATIC_EDGE_COLOR = `var(${getColorCssVar(IconColor.Muted)})`;
const TEMPORAL_EDGE_COLOR = `var(${getColorCssVar(IconColor.Info)})`;
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
  const nodesInitialized = useNodesInitialized();
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
            color: "context-stroke",
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
    if (!nodesInitialized) return;
    fit();
    const element = canvasRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit, layout, nodesInitialized]);

  return (
    <>
      <Stack
        align={Align.Center}
        aria-label="Transform graph controls"
        className={styles.graphToolbar}
        justify={Justify.Between}
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
      >
        <Stack
          align={Align.Center}
          className={styles.toolbarSearch}
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
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
            spacing={Spacing.None}
          />
          {queryActive ? (
            <Text color={TextColor.Secondary} variant={TextVariant.Xs}>
              {matchingFrameIds.size} of {analysis.frames.length}
            </Text>
          ) : null}
        </Stack>
        <Stack
          align={Align.Center}
          orientation={Orientation.Row}
          spacing={Spacing.Xs}
        >
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
        </Stack>
      </Stack>
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
          onNodesChange={handleNodeChanges}
          panOnDrag
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
        >
          <Background
            color={GRID_DOT_COLOR}
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
  const borderColor = selected
    ? BorderColor.Active
    : data.isolated
      ? BorderColor.Error
      : data.dataBearing
        ? BorderColor.Strong
        : BorderColor.Default;
  const iconColor = selected
    ? BrandColor.Accent
    : data.isolated
      ? IconColor.Destructive
      : data.dataBearing
        ? IconColor.Info
        : IconColor.Muted;
  return (
    <Card
      background={selected ? CardBackground.Elevated : CardBackground.Secondary}
      className={`${styles.flowNodeCard} ${borderColorClass(borderColor)}`}
      compact
      outlined
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
      <Stack
        align={Align.Center}
        className={styles.flowNodeContent}
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
      >
        <Icon
          color={iconColor}
          name={data.dataBearing ? IconName.Database : IconName.Waypoints}
          size={Size.Md}
        />
        <Stack
          className={styles.flowNodeText}
          orientation={Orientation.Column}
          spacing={Spacing.None}
        >
          <Text
            className={styles.flowNodeLabel}
            color={TextColor.Primary}
            variant={TextVariant.Xs}
          >
            {data.frameId}
          </Text>
          <Text
            className={styles.flowNodeMeta}
            color={TextColor.Muted}
            variant={TextVariant.Xxs}
          >
            {data.sourceSummary}
          </Text>
        </Stack>
      </Stack>
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
    </Card>
  );
}

function TransformComponentNode({ data }: NodeProps<ComponentFlowNode>) {
  return (
    <Card
      background={CardBackground.Primary}
      className={styles.flowComponent}
      compact
      outlined
    >
      {data.label ? (
        <Text color={TextColor.Secondary} variant={TextVariant.Label}>
          {data.label}
        </Text>
      ) : null}
    </Card>
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
  if (selected || kind === "mixed") return ACTIVE_EDGE_COLOR;
  return kind === "temporal" ? TEMPORAL_EDGE_COLOR : STATIC_EDGE_COLOR;
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
