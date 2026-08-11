import { useSetTileTitle } from "@fiftyone/tiling";
import {
  BackgroundColor,
  Button,
  EmptyState,
  FormField,
  IconName,
  Input,
  InputType,
  Pill,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EpisodeTileProps } from "../tiles/tile-types";
import {
  analyzeTransformTopology,
  type TransformTopologyAnalysis,
  type TransformTopologyComponent,
  type TransformTopologyEdge,
  type TransformTopologyFrame,
  type TransformTopologyIssue,
} from "../../../runtime";
import { layoutTransformTopology } from "../../../runtime/transform-topology-layout";
import {
  useTransformTopologyCapability,
  useTransformTopologyScan,
} from "./transform-topology-context";
import styles from "./TransformGraphTile.module.css";

type Selection =
  | { readonly id: string; readonly kind: "edge" }
  | { readonly id: string; readonly kind: "frame" };

interface Viewport {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
const MIN_READABLE_FIT_SCALE = 0.65;
const GRAPH_INSET = 28;

/** Static, demand-driven transform topology diagnostic tile. */
const TransformGraphTile: React.FC<EpisodeTileProps> = () => {
  const setTileTitle = useSetTileTitle();
  const capability = useTransformTopologyCapability();
  const scan = useTransformTopologyScan();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);

  // This effect keeps the surrounding tile header aligned with this view.
  useEffect(() => {
    setTileTitle("Transforms", { source: "auto" });
  }, [setTileTitle]);

  const analysis = useMemo(
    () => analyzeTransformTopology(scan.edges, scan.frameUses),
    [scan.edges, scan.frameUses],
  );
  const layout = useMemo(() => layoutTransformTopology(analysis), [analysis]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingFrameIds = useMemo(
    () =>
      new Set(
        analysis.frames
          .filter((frame) =>
            frame.id.toLocaleLowerCase().includes(normalizedQuery),
          )
          .map((frame) => frame.id),
      ),
    [analysis.frames, normalizedQuery],
  );

  if (!capability) {
    return (
      <TileState>
        <EmptyState
          description="This recording format does not expose bounded transform topology analysis."
          icon={IconName.Unsupported}
          title="Transform analysis unavailable"
        />
      </TileState>
    );
  }
  if (scan.loading && analysis.frames.length === 0 && !scan.error) {
    return (
      <TileState status="Reading transforms">
        <Spinner size={Size.Lg} />
      </TileState>
    );
  }
  if (scan.error && analysis.frames.length === 0) {
    return (
      <TileState>
        <EmptyState
          description="The transform data could not be read."
          icon={IconName.Error}
          title="Transform analysis failed"
        />
        <Button
          leadingIcon={IconName.Refresh}
          onClick={scan.retry}
          size={Size.Sm}
          variant={Variant.Secondary}
        >
          Retry bounded scan
        </Button>
      </TileState>
    );
  }
  if (!scan.loading && analysis.frames.length === 0) {
    const emptyAnalysisIsPartial = !scan.complete;
    const emptyTitle = scan.sampled
      ? "No transform sample found"
      : "More data needed";
    return (
      <TileState>
        <EmptyState
          description={
            emptyAnalysisIsPartial
              ? scan.sampled
                ? "The targeted read did not return a usable transform graph."
                : "We scanned a tiny bit of your episode but looks like we need to sample more transform data to build this view"
              : "The complete analysis contained no frame-transform relationships or renderable frame IDs."
          }
          icon={emptyAnalysisIsPartial ? IconName.Warning : IconName.Workspaces}
          title={
            emptyAnalysisIsPartial
              ? emptyTitle
              : "No transform topology observed"
          }
        />
        {scan.continuation ? (
          <Button
            leadingIcon={IconName.ArrowRight}
            onClick={scan.continueAnalysis}
            size={Size.Sm}
            variant={Variant.Secondary}
          >
            Continue analysis
          </Button>
        ) : null}
        {scan.canSample ? (
          <Button
            leadingIcon={IconName.ArrowRight}
            onClick={scan.continueAnyway}
            size={Size.Sm}
            variant={Variant.Secondary}
          >
            Continue anyway
          </Button>
        ) : null}
      </TileState>
    );
  }

  return (
    <div className={styles.root} data-testid="transform-graph-tile">
      <SummaryHeader analysis={analysis} scan={scan} />
      <CoverageNotice scan={scan} />
      <div className={styles.workspace}>
        <section className={styles.graphColumn} aria-label="Transform graph">
          <div className={styles.graphToolbar}>
            <FormField
              className={styles.searchField}
              control={
                <Input
                  aria-label="Filter transform frames"
                  icon={IconName.Search}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Frame name"
                  size={Size.Sm}
                  type={InputType.Search}
                  value={query}
                />
              }
            />
            {normalizedQuery ? (
              <Text color={TextColor.Secondary} variant={TextVariant.Xs}>
                {matchingFrameIds.size} of {analysis.frames.length}
              </Text>
            ) : null}
          </div>
          <TopologyCanvas
            analysis={analysis}
            layout={layout}
            matchingFrameIds={matchingFrameIds}
            onSelect={setSelection}
            queryActive={normalizedQuery.length > 0}
            selection={selection}
          />
        </section>
        <aside className={styles.details} aria-label="Transform details">
          <SelectionDetails analysis={analysis} selection={selection} />
          <IssueList issues={analysis.issues} onSelect={setSelection} />
        </aside>
      </div>
    </div>
  );
};

function SummaryHeader({
  analysis,
  scan,
}: {
  readonly analysis: TransformTopologyAnalysis;
  readonly scan: ReturnType<typeof useTransformTopologyScan>;
}) {
  const hasErrors = analysis.issues.some((issue) => issue.severity === "error");
  const dataBearingComponents = analysis.components.filter(
    (component) => component.dataBearingFrameCount > 0,
  ).length;
  return (
    <header className={styles.summary}>
      <div className={styles.summaryMetrics}>
        <SummaryMetric
          label={analysis.summary.componentCount === 1 ? "Tree" : "Components"}
          value={analysis.summary.componentCount}
        />
        <SummaryMetric label="Frames" value={analysis.summary.frameCount} />
        <SummaryMetric label="Edges" value={analysis.summary.edgeCount} />
        <SummaryMetric
          emphasis={hasErrors}
          label="Health"
          value={hasErrors ? `${analysis.issues.length} issues` : "Connected"}
        />
      </div>
      <div className={styles.summaryStatus}>
        {dataBearingComponents > 1 ? (
          <Text color={TextColor.Destructive} variant={TextVariant.Xs}>
            Data spans {dataBearingComponents} disconnected components
          </Text>
        ) : null}
        {scan.complete ? (
          <Pill
            backgroundColor={BackgroundColor.Secondary}
            color={TextColor.Primary}
            isStatus
            size={Size.Xs}
          >
            Complete
          </Pill>
        ) : null}
      </div>
    </header>
  );
}

function SummaryMetric({
  emphasis = false,
  label,
  value,
}: {
  readonly emphasis?: boolean;
  readonly label: string;
  readonly value: number | string;
}) {
  return (
    <div className={styles.metric}>
      <Text color={TextColor.Secondary} variant={TextVariant.Xxs}>
        {label}
      </Text>
      <Text
        color={emphasis ? TextColor.Destructive : TextColor.Primary}
        variant={TextVariant.Sm}
      >
        {value}
      </Text>
    </div>
  );
}

function CoverageNotice({
  scan,
}: {
  readonly scan: ReturnType<typeof useTransformTopologyScan>;
}) {
  if (scan.complete && !scan.error) return null;
  const coverageSummary = scan.error
    ? "Analysis interrupted"
    : scan.sampled
      ? "Sampled analysis"
      : "Partial analysis";
  return (
    <div
      className={styles.coverageNotice}
      data-testid="transform-topology-partial"
      role={scan.error ? "alert" : "status"}
    >
      <div className={styles.coverageText} title={coverageSummary}>
        <Text
          color={scan.error ? TextColor.Destructive : TextColor.Warning}
          variant={TextVariant.Xs}
        >
          {coverageSummary}
        </Text>
      </div>
      <div className={styles.coverageActions}>
        {scan.error ? (
          <Button
            leadingIcon={IconName.Refresh}
            onClick={scan.retry}
            size={Size.Xs}
            variant={Variant.Secondary}
          >
            Retry
          </Button>
        ) : null}
        {scan.continuation ? (
          <Button
            disabled={scan.loading}
            leadingIcon={scan.loading ? IconName.Spinner : IconName.ArrowRight}
            onClick={scan.continueAnalysis}
            size={Size.Xs}
            variant={Variant.Secondary}
          >
            {scan.loading ? "Reading slice" : "Continue analysis"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TopologyCanvas({
  analysis,
  layout,
  matchingFrameIds,
  onSelect,
  queryActive,
  selection,
}: {
  readonly analysis: TransformTopologyAnalysis;
  readonly layout: ReturnType<typeof layoutTransformTopology>;
  readonly matchingFrameIds: ReadonlySet<string>;
  readonly onSelect: (selection: Selection) => void;
  readonly queryActive: boolean;
  readonly selection: Selection | null;
}) {
  const arrowMarkerId = `transform-topology-arrow-${useId().replaceAll(":", "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly viewport: Viewport;
  } | null>(null);
  const edgeById = useMemo(
    () => new Map(analysis.edges.map((edge) => [edge.id, edge])),
    [analysis.edges],
  );
  const frameById = useMemo(
    () => new Map(analysis.frames.map((frame) => [frame.id, frame])),
    [analysis.frames],
  );
  const issuesByFrame = useMemo(() => {
    const map = new Map<string, TransformTopologyIssue[]>();
    for (const issue of analysis.issues) {
      for (const frameId of issue.affectedFrameIds) {
        const issues = map.get(frameId) ?? [];
        issues.push(issue);
        map.set(frameId, issues);
      }
    }
    return map;
  }, [analysis.issues]);
  const componentRects = useMemo(
    () => componentBounds(analysis.components, layout.nodes),
    [analysis.components, layout.nodes],
  );

  const fit = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const fittedScale = Math.min(
      (element.clientWidth - GRAPH_INSET * 2) / layout.bounds.width,
      (element.clientHeight - GRAPH_INSET * 2) / layout.bounds.height,
    );
    const scale = clamp(fittedScale, MIN_READABLE_FIT_SCALE, MAX_SCALE);
    const largestComponent = [...componentRects].sort(
      (left, right) =>
        right.frameCount - left.frameCount ||
        right.dataBearingFrameCount - left.dataBearingFrameCount ||
        left.id.localeCompare(right.id),
    )[0];
    const focusBounds =
      fittedScale < MIN_READABLE_FIT_SCALE && largestComponent
        ? largestComponent
        : {
            height: layout.bounds.height,
            width: layout.bounds.width,
            x: 0,
            y: 0,
          };
    setViewport({
      scale,
      x:
        (element.clientWidth - focusBounds.width * scale) / 2 -
        focusBounds.x * scale,
      y:
        (element.clientHeight - focusBounds.height * scale) / 2 -
        focusBounds.y * scale,
    });
  }, [componentRects, layout.bounds.height, layout.bounds.width]);

  // This effect fits the graph initially and after its tile changes size.
  useEffect(() => {
    fit();
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

  const zoom = useCallback((factor: number) => {
    const element = containerRef.current;
    if (!element) return;
    setViewport((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      const centerX = element.clientWidth / 2;
      const centerY = element.clientHeight / 2;
      const ratio = scale / current.scale;
      return {
        scale,
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
      };
    });
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [zoom]);

  return (
    <div
      className={styles.canvas}
      data-testid="transform-topology-canvas"
      onPointerDown={(event) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          viewport,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setViewport({
          ...drag.viewport,
          x: drag.viewport.x + event.clientX - drag.startX,
          y: drag.viewport.y + event.clientY - drag.startY,
        });
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId)
          dragRef.current = null;
      }}
      onPointerCancel={(event) => {
        if (dragRef.current?.pointerId === event.pointerId)
          dragRef.current = null;
      }}
      onLostPointerCapture={(event) => {
        if (dragRef.current?.pointerId === event.pointerId)
          dragRef.current = null;
      }}
      ref={containerRef}
    >
      <div className={styles.canvasControls}>
        <Button
          aria-label="Zoom out"
          borderless
          leadingIcon={IconName.Remove}
          onClick={() => zoom(1 / 1.2)}
          size={Size.Xs}
          variant={Variant.Icon}
        />
        <Button
          aria-label="Zoom in"
          borderless
          leadingIcon={IconName.Add}
          onClick={() => zoom(1.2)}
          size={Size.Xs}
          variant={Variant.Icon}
        />
        <Button
          aria-label="Fit transform graph"
          borderless
          leadingIcon={IconName.Fullscreen}
          onClick={fit}
          size={Size.Xs}
          title="Fit at a readable scale"
          variant={Variant.Icon}
        />
        <Button
          aria-label="Reset transform graph view"
          borderless
          leadingIcon={IconName.Undo}
          onClick={() => setViewport({ scale: 1, x: 0, y: 0 })}
          size={Size.Xs}
          title="Reset graph view"
          variant={Variant.Icon}
        />
      </div>
      <svg
        aria-label="Static transform topology"
        className={styles.svg}
        role="group"
      >
        <defs>
          <marker
            id={arrowMarkerId}
            markerHeight="7"
            markerUnits="strokeWidth"
            markerWidth="7"
            orient="auto"
            refX="6"
            refY="3.5"
          >
            <path className={styles.arrowHead} d="M 0 0 L 7 3.5 L 0 7 z" />
          </marker>
        </defs>
        <g
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
        >
          {componentRects.map((component, index) => (
            <g key={component.id}>
              <rect
                className={styles.componentBox}
                height={component.height}
                rx="12"
                width={component.width}
                x={component.x}
                y={component.y}
              />
              <text
                className={styles.componentLabel}
                x={component.x + 12}
                y={component.y + 19}
              >
                {`Component ${index + 1} · ${component.dataBearingFrameCount} data frame${component.dataBearingFrameCount === 1 ? "" : "s"}`}
              </text>
            </g>
          ))}
          {layout.edges.map((layoutEdge) => {
            const edge = edgeById.get(layoutEdge.edgeId);
            if (!edge) return null;
            const matched =
              !queryActive ||
              matchingFrameIds.has(edge.parentFrameId) ||
              matchingFrameIds.has(edge.childFrameId);
            const selected =
              selection?.kind === "edge" && selection.id === edge.id;
            const path = edgePath(layoutEdge.source, layoutEdge.target);
            const edgeVariant = styles[`edge_${edge.kind}`] ?? "";
            return (
              <g
                aria-label={`Transform edge ${edge.parentFrameId} to ${edge.childFrameId}`}
                aria-hidden={!matched || undefined}
                className={!matched ? styles.filtered : undefined}
                key={edge.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({ id: edge.id, kind: "edge" });
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect({ id: edge.id, kind: "edge" });
                }}
                role="button"
                tabIndex={matched ? 0 : -1}
              >
                <path
                  className={`${styles.edge} ${edgeVariant} ${selected ? styles.selectedEdge : ""}`}
                  d={path}
                  markerEnd={`url(#${arrowMarkerId})`}
                />
                <path className={styles.edgeHitTarget} d={path} />
              </g>
            );
          })}
          {layout.nodes.map((node) => {
            const frame = frameById.get(node.frameId);
            if (!frame) return null;
            const matched = !queryActive || matchingFrameIds.has(frame.id);
            const selected =
              selection?.kind === "frame" && selection.id === frame.id;
            const frameIssues = issuesByFrame.get(frame.id) ?? [];
            return (
              <g
                aria-label={`Frame ${frame.id}`}
                aria-hidden={!matched || undefined}
                className={`${styles.node} ${!matched ? styles.filtered : ""}`}
                key={frame.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({ id: frame.id, kind: "frame" });
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect({ id: frame.id, kind: "frame" });
                }}
                role="button"
                tabIndex={matched ? 0 : -1}
                transform={`translate(${node.x} ${node.y})`}
              >
                <rect
                  className={`${styles.nodeBox} ${frame.dataBearing ? styles.dataNode : ""} ${frameIssues.length > 0 ? styles.issueNode : ""} ${selected ? styles.selectedNode : ""}`}
                  height={node.height}
                  rx="7"
                  width={node.width}
                />
                <title>{frame.id}</title>
                <text className={styles.nodeLabel} x="12" y="18">
                  {shortFrameLabel(frame.id)}
                </text>
                <text className={styles.nodeMeta} x="12" y="34">
                  {frame.dataBearing
                    ? `${frame.streamIds.length} renderable stream${frame.streamIds.length === 1 ? "" : "s"}`
                    : frameIssues.length > 0
                      ? `${frameIssues.length} structural issue${frameIssues.length === 1 ? "" : "s"}`
                      : "transform frame"}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function SelectionDetails({
  analysis,
  selection,
}: {
  readonly analysis: TransformTopologyAnalysis;
  readonly selection: Selection | null;
}) {
  const frame =
    selection?.kind === "frame"
      ? analysis.frames.find((candidate) => candidate.id === selection.id)
      : undefined;
  const edge =
    selection?.kind === "edge"
      ? analysis.edges.find((candidate) => candidate.id === selection.id)
      : undefined;
  if (!frame && !edge) {
    return (
      <section className={styles.detailSection}>
        <SectionTitle>Selection</SectionTitle>
        <Text color={TextColor.Secondary} variant={TextVariant.Xs}>
          Select a frame or edge for provenance and stream usage.
        </Text>
      </section>
    );
  }
  return (
    <section
      className={styles.detailSection}
      data-testid="transform-selection-details"
    >
      <SectionTitle>{frame ? "Frame" : "Edge"}</SectionTitle>
      {frame ? <FrameDetails analysis={analysis} frame={frame} /> : null}
      {edge ? <EdgeDetails edge={edge} /> : null}
    </section>
  );
}

function FrameDetails({
  analysis,
  frame,
}: {
  readonly analysis: TransformTopologyAnalysis;
  readonly frame: TransformTopologyFrame;
}) {
  const componentIndex = analysis.components.findIndex((component) =>
    component.frameIds.includes(frame.id),
  );
  const relatedEdges = analysis.edges.filter(
    (edge) => edge.parentFrameId === frame.id || edge.childFrameId === frame.id,
  );
  return (
    <dl className={styles.detailGrid}>
      <Detail label="Name" value={frame.id} />
      <Detail label="Component" value={`${componentIndex + 1}`} />
      <Detail
        label="Relationships"
        value={relatedEdges.length.toLocaleString()}
      />
      <Detail
        label="Renderable streams"
        value={
          frame.sourceNames.length > 0
            ? frame.sourceNames.join(", ")
            : "None observed"
        }
      />
      {frame.dataBearing ? (
        <div className={styles.sampleNote}>
          Stream frame IDs are sampled only from messages admitted by the
          bounded topology slices.
        </div>
      ) : null}
    </dl>
  );
}

function EdgeDetails({ edge }: { readonly edge: TransformTopologyEdge }) {
  return (
    <dl className={styles.detailGrid}>
      <Detail label="Parent" value={edge.parentFrameId} />
      <Detail label="Child" value={edge.childFrameId} />
      <Detail label="Kind" value={capitalize(edge.kind)} />
      <Detail label="Source topic" value={edge.sourceNames.join(", ")} />
      <Detail
        label="Occurrences"
        value={edge.occurrenceCount.toLocaleString()}
      />
      {edge.firstObservedTimeNs !== undefined ? (
        <Detail
          label="First observed"
          value={formatNanoseconds(edge.firstObservedTimeNs)}
        />
      ) : null}
      {edge.lastObservedTimeNs !== undefined ? (
        <Detail
          label="Last observed"
          value={formatNanoseconds(edge.lastObservedTimeNs)}
        />
      ) : null}
    </dl>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  );
}

function IssueList({
  issues,
  onSelect,
}: {
  readonly issues: readonly TransformTopologyIssue[];
  readonly onSelect: (selection: Selection) => void;
}) {
  return (
    <section className={styles.detailSection}>
      <SectionTitle>Graph health</SectionTitle>
      {issues.length === 0 ? (
        <div className={styles.healthy}>
          <Pill
            backgroundColor={BackgroundColor.Secondary}
            color={TextColor.Success}
            icon={IconName.ShieldCheck}
            isStatus
            size={Size.Xs}
          >
            No structural issues observed
          </Pill>
        </div>
      ) : (
        <div className={styles.issueList}>
          {issues.map((issue) => (
            <button
              className={styles.issue}
              key={issue.id}
              onClick={() => {
                const frameId = issue.affectedFrameIds[0];
                if (frameId) onSelect({ id: frameId, kind: "frame" });
              }}
              type="button"
            >
              <span className={styles.issueHeader}>
                <span
                  aria-hidden="true"
                  className={
                    issue.severity === "error"
                      ? styles.errorDot
                      : styles.warningDot
                  }
                />
                {issue.title}
              </span>
              <span className={styles.issueDetail}>{issue.detail}</span>
              {issue.suggestion ? (
                <span className={styles.suggestion}>
                  Suggested spelling: {issue.suggestion}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function SectionTitle({ children }: { readonly children: React.ReactNode }) {
  return (
    <Text color={TextColor.Primary} variant={TextVariant.Label}>
      {children}
    </Text>
  );
}

function TileState({
  children,
  status,
}: {
  readonly children: React.ReactNode;
  readonly status?: string;
}) {
  return (
    <div className={styles.tileState} role={status ? "status" : undefined}>
      {children}
      {status ? (
        <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
          {status}
        </Text>
      ) : null}
    </div>
  );
}

function componentBounds(
  components: readonly TransformTopologyComponent[],
  nodes: readonly {
    readonly frameId: string;
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }[],
) {
  const nodeByFrame = new Map(nodes.map((node) => [node.frameId, node]));
  return components.flatMap((component) => {
    const componentNodes = component.frameIds.flatMap((frameId) => {
      const node = nodeByFrame.get(frameId);
      return node ? [node] : [];
    });
    if (componentNodes.length === 0) return [];
    const x = Math.min(...componentNodes.map((node) => node.x)) - 12;
    const y = Math.min(...componentNodes.map((node) => node.y)) - 32;
    const right = Math.max(
      ...componentNodes.map((node) => node.x + node.width),
    );
    const bottom = Math.max(
      ...componentNodes.map((node) => node.y + node.height),
    );
    return [
      {
        dataBearingFrameCount: component.dataBearingFrameCount,
        frameCount: component.frameIds.length,
        height: bottom - y + 12,
        id: component.id,
        width: right - x + 12,
        x,
        y,
      },
    ];
  });
}

function edgePath(
  source: readonly [number, number],
  target: readonly [number, number],
): string {
  const bend = Math.max(36, Math.abs(target[0] - source[0]) * 0.45);
  const direction = target[0] >= source[0] ? 1 : -1;
  return `M ${source[0]} ${source[1]} C ${source[0] + bend * direction} ${source[1]}, ${target[0] - bend * direction} ${target[1]}, ${target[0]} ${target[1]}`;
}

function shortFrameLabel(frameId: string): string {
  return frameId.length <= 24 ? frameId : `${frameId.slice(0, 21)}…`;
}

function formatNanoseconds(value: bigint): string {
  return `${value.toLocaleString()} ns`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default TransformGraphTile;
