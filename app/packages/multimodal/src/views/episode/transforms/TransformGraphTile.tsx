import { useSetTileTitle } from "@fiftyone/tiling";
import {
  BackgroundColor,
  Button,
  EmptyState,
  IconName,
  Pill,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { EpisodeTileProps } from "../tiles/tile-types";
import { usePlaybackTimeNs } from "../playback/use-playback-time-ns";
import {
  analyzeTransformTopology,
  type TransformTopologyAnalysis,
  type TransformTopologyEdge,
  type TransformTopologyFrame,
  type TransformTopologyIssue,
  type TransformTopologySource,
} from "../../../runtime";
import { layoutTransformTopology } from "../../../runtime/transform-topology-layout";
import {
  useTransformTopologyCapability,
  useTransformTopologyScan,
} from "./transform-topology-context";
import {
  TransformGraphCanvas,
  type TransformGraphSelection,
} from "./TransformGraphCanvas";
import styles from "./TransformGraphTile.module.css";
import { usePublishVisibleStreams } from "../stream-discovery/visible-streams";

type Selection = TransformGraphSelection;

/** Static, demand-driven transform topology diagnostic tile. */
const TransformGraphTile: React.FC<EpisodeTileProps> = () => {
  const setTileTitle = useSetTileTitle();
  const capability = useTransformTopologyCapability();
  const playbackTimeNs = usePlaybackTimeNs();
  const scan = useTransformTopologyScan(playbackTimeNs);
  const requestAnalyzeMore = scan.analyzeMore;
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const analyzeMore = useCallback(() => {
    requestAnalyzeMore(playbackTimeNs);
  }, [playbackTimeNs, requestAnalyzeMore]);

  // This effect keeps the surrounding tile header aligned with this view.
  useEffect(() => {
    setTileTitle("Transforms", { source: "auto" });
  }, [setTileTitle]);

  const analysis = useMemo(
    () => analyzeTransformTopology(scan.edges, scan.frameUses),
    [scan.edges, scan.frameUses],
  );
  const visibleStreams = useMemo(
    () => [
      ...analysis.edges.flatMap((edge) => edge.sourceStreamIds),
      ...analysis.frames.flatMap((frame) => frame.streamIds),
    ],
    [analysis],
  );
  usePublishVisibleStreams(visibleStreams);
  const layout = useMemo(() => layoutTransformTopology(analysis), [analysis]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingFrameIds = useMemo(
    () =>
      new Set(
        analysis.frames
          .filter((frame) =>
            [
              frame.id,
              ...frame.sourceNames,
              ...frame.transformSources.map((source) => source.sourceName),
            ].some((value) =>
              value.toLocaleLowerCase().includes(normalizedQuery),
            ),
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
  if (
    scan.loading &&
    scan.operation === "scan" &&
    analysis.frames.length === 0 &&
    !scan.error
  ) {
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
  if (analysis.frames.length === 0) {
    const emptyAnalysisIsPartial = scan.status !== "complete" || scan.loading;
    const hasTimeSamples = scan.sampledTimesNs.length > 0;
    const emptyTitle = hasTimeSamples
      ? "No transform sample found"
      : "More data needed";
    return (
      <TileState>
        <EmptyState
          description={
            emptyAnalysisIsPartial
              ? hasTimeSamples
                ? "The targeted read did not return a usable transform graph."
                : "The initial bounded scan did not find enough transform data. Analyze more to continue the scan and include the current time."
              : "The complete analysis contained no frame-transform relationships or renderable frame IDs."
          }
          icon={emptyAnalysisIsPartial ? IconName.Warning : IconName.Workspaces}
          title={
            emptyAnalysisIsPartial
              ? emptyTitle
              : "No transform topology observed"
          }
        />
        {!scan.error ? (
          <div className={styles.coverageActions}>
            {scan.canAnalyzeMore ? (
              <Button
                disabled={scan.loading}
                leadingIcon={
                  scan.operation === "analyze"
                    ? IconName.Spinner
                    : IconName.Refresh
                }
                onClick={analyzeMore}
                size={Size.Sm}
                variant={Variant.Secondary}
              >
                {scan.operation === "analyze" ? "Analyzing…" : "Analyze more"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </TileState>
    );
  }

  return (
    <div className={styles.root} data-testid="transform-graph-tile">
      <SummaryHeader analysis={analysis} scan={scan} />
      <CoverageNotice onAnalyzeMore={analyzeMore} scan={scan} />
      <div className={styles.workspace}>
        <section className={styles.graphColumn} aria-label="Transform graph">
          <TransformGraphCanvas
            analysis={analysis}
            layout={layout}
            matchingFrameIds={matchingFrameIds}
            onQueryChange={setQuery}
            onSelect={setSelection}
            query={query}
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
  const hasWarnings = analysis.issues.some(
    (issue) => issue.severity === "warning",
  );
  const issueCount = analysis.issues.length;
  const componentCount = analysis.summary.componentCount;
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
          label="Health"
          severity={hasErrors ? "error" : hasWarnings ? "warning" : undefined}
          value={
            issueCount === 0
              ? "Connected"
              : `${issueCount} ${issueCount === 1 ? "issue" : "issues"}`
          }
        />
      </div>
      <div className={styles.summaryStatus}>
        {componentCount > 1 ? (
          <Text
            color={hasErrors ? TextColor.Failure : TextColor.Warning}
            variant={TextVariant.Xs}
          >
            {componentCount} disconnected components
          </Text>
        ) : null}
        {scan.status === "complete" ? (
          <Pill
            backgroundColor={BackgroundColor.Secondary}
            color={TextColor.Primary}
            isStatus
            size={Size.Xs}
          >
            Transform scan complete
          </Pill>
        ) : null}
      </div>
    </header>
  );
}

function SummaryMetric({
  label,
  severity,
  value,
}: {
  readonly label: string;
  readonly severity?: TransformTopologyIssue["severity"];
  readonly value: number | string;
}) {
  return (
    <div className={styles.metric}>
      <Text color={TextColor.Secondary} variant={TextVariant.Xxs}>
        {label}
      </Text>
      <Text
        color={
          severity === "error"
            ? TextColor.Failure
            : severity === "warning"
              ? TextColor.Warning
              : TextColor.Primary
        }
        variant={TextVariant.Sm}
      >
        {value}
      </Text>
    </div>
  );
}

function CoverageNotice({
  onAnalyzeMore,
  scan,
}: {
  readonly onAnalyzeMore: () => void;
  readonly scan: ReturnType<typeof useTransformTopologyScan>;
}) {
  if (scan.status === "complete" && !scan.error && !scan.loading) return null;
  const coverageSummary = scan.error
    ? "Analysis interrupted"
    : "Partial analysis";
  return (
    <div
      className={styles.coverageNotice}
      data-testid="transform-topology-partial"
      role={scan.error ? "alert" : "status"}
    >
      <div className={styles.coverageText} title={coverageSummary}>
        <Text
          color={scan.error ? TextColor.Failure : TextColor.Warning}
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
        {!scan.error && scan.canAnalyzeMore ? (
          <Button
            disabled={scan.loading}
            leadingIcon={
              scan.operation === "analyze" ? IconName.Spinner : IconName.Refresh
            }
            onClick={onAnalyzeMore}
            size={Size.Xs}
            variant={Variant.Secondary}
          >
            {scan.operation === "analyze" ? "Analyzing…" : "Analyze more"}
          </Button>
        ) : null}
      </div>
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
          Select a frame or edge for details.
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
      {frame.transformSources.length > 0 ? (
        <div className={styles.detailRow}>
          <dt>Transform sources</dt>
          <dd className={styles.sourcePills}>
            {frame.transformSources.map((source) => (
              <Pill
                backgroundColor={BackgroundColor.Secondary}
                color={transformSourceColor(source.kind)}
                isStatus
                key={`${source.kind}:${source.sourceName}`}
                size={Size.Xs}
              >
                {`${capitalize(source.kind)} · ${source.sourceName}`}
              </Pill>
            ))}
          </dd>
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

function transformSourceColor(
  kind: TransformTopologySource["kind"],
): TextColor {
  if (kind === "static") return TextColor.Info;
  if (kind === "temporal") return TextColor.Warning;
  return TextColor.Primary;
}

function formatNanoseconds(value: bigint): string {
  return `${value.toLocaleString()} ns`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export default TransformGraphTile;
