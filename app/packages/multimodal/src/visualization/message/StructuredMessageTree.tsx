import React, { useCallback, useState } from "react";
import type { RawObjectNode, RawValueNode } from "../../ir";
import { rawNodeToJson } from "../../ir";
import styles from "./StructuredMessage.module.css";
import { useCopyFeedback } from "../panel-ui/use-copy-feedback";

/** Levels expanded by default; deeper nodes open on demand. */
const AUTO_EXPAND_DEPTH = 2;

/** Maximum object fields materialized at once at any one tree level. */
const OBJECT_ENTRY_PAGE_SIZE = 100;

/** Collision-free state key for the tree root. */
const ROOT_NODE_KEY = "$root";

function objectChildNodeKey(parent: string, key: string): string {
  return `${parent}/o:${encodeURIComponent(key)}`;
}

function arrayChildNodeKey(parent: string, index: number): string {
  return `${parent}/a:${index}`;
}

type CopyStatus = "idle" | "copied" | "failed";

interface CopyFeedback {
  readonly path: string | null;
  readonly status: CopyStatus;
}

const IDLE_COPY_FEEDBACK: CopyFeedback = { path: null, status: "idle" };

/** Structured record and optional numeric-field interactions shown by the tree. */
export interface StructuredMessageTreeProps {
  readonly onAddNumericFieldToPlot?: (path: string) => void;
  readonly root: RawObjectNode;
}

/**
 * Collapsible tree over one pruned message record. Children render only
 * while their parent is expanded, so even a budget-maxed tree stays a
 * few hundred DOM nodes. Expansion state is keyed by field path and
 * lives across record refreshes — watching one value during playback
 * must not re-fold the tree every message.
 */
const StructuredMessageTree: React.FC<StructuredMessageTreeProps> = ({
  onAddNumericFieldToPlot,
  root,
}) => {
  const [expandedOverrides, setExpandedOverrides] = useState<
    ReadonlyMap<string, boolean>
  >(new Map());
  const [visibleObjectEntries, setVisibleObjectEntries] = useState<
    ReadonlyMap<string, number>
  >(new Map());
  const [copyFeedback, showCopyFeedback] =
    useCopyFeedback<CopyFeedback>(IDLE_COPY_FEEDBACK);
  const copyAttemptRef = React.useRef(0);
  const [plottedPath, showPlottedPath] = useCopyFeedback<string | null>(null);

  React.useEffect(
    () => () => {
      copyAttemptRef.current += 1;
    },
    [],
  );

  const toggle = useCallback((nodeKey: string, expanded: boolean) => {
    setExpandedOverrides((previous) => {
      const next = new Map(previous);
      next.set(nodeKey, expanded);
      return next;
    });
  }, []);

  const showMoreObjectEntries = useCallback((nodeKey: string) => {
    setVisibleObjectEntries((previous) => {
      const next = new Map(previous);
      next.set(
        nodeKey,
        (previous.get(nodeKey) ?? OBJECT_ENTRY_PAGE_SIZE) +
          OBJECT_ENTRY_PAGE_SIZE,
      );
      return next;
    });
  }, []);

  const copy = useCallback(
    async (path: string, node: RawValueNode) => {
      const attempt = ++copyAttemptRef.current;
      if (!navigator.clipboard?.writeText) {
        if (attempt === copyAttemptRef.current) {
          showCopyFeedback({ path, status: "failed" });
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(
          JSON.stringify(rawNodeToJson(node), null, 2),
        );
        if (attempt === copyAttemptRef.current) {
          showCopyFeedback({ path, status: "copied" });
        }
      } catch {
        if (attempt === copyAttemptRef.current) {
          showCopyFeedback({ path, status: "failed" });
        }
      }
    },
    [showCopyFeedback],
  );

  const addToPlot = useCallback(
    (path: string) => {
      if (!onAddNumericFieldToPlot) {
        return;
      }
      onAddNumericFieldToPlot(path);
      showPlottedPath(path);
    },
    [onAddNumericFieldToPlot, showPlottedPath],
  );
  const effectiveAddToPlot = onAddNumericFieldToPlot ? addToPlot : undefined;
  const visibleRootEntries =
    visibleObjectEntries.get(ROOT_NODE_KEY) ?? OBJECT_ENTRY_PAGE_SIZE;
  const hiddenRootEntries = Math.max(
    0,
    root.entries.length - visibleRootEntries,
  );

  return (
    <div className={styles.tree} data-testid="episode-raw-tree">
      {root.entries.slice(0, visibleRootEntries).map(([key, node]) => (
        <TreeRow
          addToPlot={effectiveAddToPlot}
          copyFeedback={copyFeedback}
          copy={copy}
          depth={0}
          expandedOverrides={expandedOverrides}
          key={key}
          label={key}
          node={node}
          nodeKey={objectChildNodeKey(ROOT_NODE_KEY, key)}
          path={key}
          plottedPath={plottedPath}
          showMoreObjectEntries={showMoreObjectEntries}
          toggle={toggle}
          visibleObjectEntries={visibleObjectEntries}
        />
      ))}
      {hiddenRootEntries > 0 ? (
        <ObjectPaginationRow
          depth={0}
          hiddenEntries={hiddenRootEntries}
          onShowMore={() => showMoreObjectEntries(ROOT_NODE_KEY)}
          paginationKey="$"
        />
      ) : null}
      {root.droppedEntries ? (
        <div className={styles.row}>
          <span className={styles.truncatedText}>
            … {root.droppedEntries} more fields omitted
          </span>
        </div>
      ) : null}
    </div>
  );
};

interface TreeRowProps {
  readonly addToPlot?: (path: string) => void;
  readonly copyFeedback: CopyFeedback;
  readonly copy: (path: string, node: RawValueNode) => Promise<void>;
  readonly depth: number;
  readonly expandedOverrides: ReadonlyMap<string, boolean>;
  readonly label: string;
  readonly node: RawValueNode;
  readonly nodeKey: string;
  readonly path: string;
  readonly plottedPath: string | null;
  readonly showMoreObjectEntries: (path: string) => void;
  readonly toggle: (path: string, expanded: boolean) => void;
  readonly visibleObjectEntries: ReadonlyMap<string, number>;
}

const TreeRow = React.memo(function TreeRow({
  addToPlot,
  copyFeedback,
  copy,
  depth,
  expandedOverrides,
  label,
  node,
  nodeKey,
  path,
  plottedPath,
  showMoreObjectEntries,
  toggle,
  visibleObjectEntries,
}: TreeRowProps) {
  const expandable = isExpandable(node);
  const expanded =
    expandedOverrides.get(nodeKey) ?? (expandable && depth < AUTO_EXPAND_DEPTH);
  const indent = { paddingLeft: `${depth * 14}px` };
  const canAddToPlot = addToPlot !== undefined && isPlottableScalar(node);
  const addToPlotLabel =
    plottedPath === path ? `${path} plotted` : `Add ${path} to plot`;
  const copyLabel =
    copyFeedback.path === path
      ? copyFeedback.status === "copied"
        ? `${label} copied`
        : copyFeedback.status === "failed"
          ? `Copy ${label} failed`
          : `Copy ${label}`
      : `Copy ${label}`;
  const visibleEntryCount =
    visibleObjectEntries.get(nodeKey) ?? OBJECT_ENTRY_PAGE_SIZE;
  const hiddenObjectEntries =
    node.kind === "object"
      ? Math.max(0, node.entries.length - visibleEntryCount)
      : 0;

  return (
    <>
      <div className={styles.row} data-testid={`episode-raw-node-${path}`}>
        <div className={styles.rowMain} style={indent}>
          {expandable ? (
            <button
              aria-expanded={expanded}
              aria-label={`Toggle ${label}`}
              className={styles.chevron}
              data-testid={`episode-raw-toggle-${path}`}
              onClick={() => toggle(nodeKey, !expanded)}
              type="button"
            >
              {expanded ? "▾" : "▸"}
            </button>
          ) : (
            <span aria-hidden="true" className={styles.chevronSpacer} />
          )}
          <span className={styles.key}>{label}</span>
          <span className={valueClassName(node)}>
            {expanded && expandable ? "" : nodePreview(node)}
          </span>
        </div>
        {canAddToPlot ? (
          <button
            aria-label={addToPlotLabel}
            className={styles.copyButton}
            data-testid={`episode-raw-plot-${path}`}
            onClick={() => addToPlot?.(path)}
            title="Add field to plot"
            type="button"
          >
            {plottedPath === path ? "plotted" : "plot"}
          </button>
        ) : null}
        <button
          aria-label={copyLabel}
          className={styles.copyButton}
          data-testid={`episode-raw-copy-${path}`}
          onClick={() => void copy(path, node)}
          title="Copy subtree as JSON"
          type="button"
        >
          {copyFeedback.path === path
            ? copyFeedback.status === "copied"
              ? "copied"
              : copyFeedback.status === "failed"
                ? "copy failed"
                : "copy"
            : "copy"}
        </button>
      </div>
      {expanded && node.kind === "object"
        ? node.entries
            .slice(0, visibleEntryCount)
            .map(([childKey, child]) => (
              <TreeRow
                addToPlot={addToPlot}
                copyFeedback={copyFeedback}
                copy={copy}
                depth={depth + 1}
                expandedOverrides={expandedOverrides}
                key={childKey}
                label={childKey}
                node={child}
                nodeKey={objectChildNodeKey(nodeKey, childKey)}
                path={`${path}.${childKey}`}
                plottedPath={plottedPath}
                showMoreObjectEntries={showMoreObjectEntries}
                toggle={toggle}
                visibleObjectEntries={visibleObjectEntries}
              />
            ))
        : null}
      {expanded && node.kind === "object" && hiddenObjectEntries > 0 ? (
        <ObjectPaginationRow
          depth={depth + 1}
          hiddenEntries={hiddenObjectEntries}
          onShowMore={() => showMoreObjectEntries(nodeKey)}
          paginationKey={nodeKey}
        />
      ) : null}
      {expanded && node.kind === "object" && node.droppedEntries ? (
        <div className={styles.row}>
          <div
            className={styles.rowMain}
            style={{ paddingLeft: `${(depth + 1) * 14}px` }}
          >
            <span aria-hidden="true" className={styles.chevronSpacer} />
            <span className={styles.truncatedText}>
              … {node.droppedEntries} more fields omitted
            </span>
          </div>
        </div>
      ) : null}
      {expanded && node.kind === "array"
        ? node.items.map((item, index) => (
            <TreeRow
              addToPlot={addToPlot}
              copyFeedback={copyFeedback}
              copy={copy}
              depth={depth + 1}
              expandedOverrides={expandedOverrides}
              key={index}
              label={String(index)}
              node={item}
              nodeKey={arrayChildNodeKey(nodeKey, index)}
              path={`${path}.${index}`}
              plottedPath={plottedPath}
              showMoreObjectEntries={showMoreObjectEntries}
              toggle={toggle}
              visibleObjectEntries={visibleObjectEntries}
            />
          ))
        : null}
      {expanded &&
      node.kind === "array" &&
      node.totalLength > node.items.length ? (
        <div className={styles.row}>
          <div
            className={styles.rowMain}
            style={{ paddingLeft: `${(depth + 1) * 14}px` }}
          >
            <span aria-hidden="true" className={styles.chevronSpacer} />
            <span className={styles.truncatedText}>
              … {(node.totalLength - node.items.length).toLocaleString()} more
              items omitted
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
});

function ObjectPaginationRow({
  depth,
  hiddenEntries,
  onShowMore,
  paginationKey,
}: {
  readonly depth: number;
  readonly hiddenEntries: number;
  readonly onShowMore: () => void;
  readonly paginationKey: string;
}) {
  return (
    <div className={styles.row}>
      <div
        className={styles.rowMain}
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        <span aria-hidden="true" className={styles.chevronSpacer} />
        <button
          className={styles.showMoreButton}
          data-testid={`episode-raw-show-more-${paginationKey}`}
          onClick={onShowMore}
          type="button"
        >
          Show {Math.min(OBJECT_ENTRY_PAGE_SIZE, hiddenEntries)} more fields
        </button>
        <span className={styles.truncatedText}>
          ({hiddenEntries.toLocaleString()} not rendered)
        </span>
      </div>
    </div>
  );
}

function isExpandable(node: RawValueNode): boolean {
  return (
    (node.kind === "object" && node.entries.length > 0) ||
    (node.kind === "array" && node.items.length > 0)
  );
}

function isPlottableScalar(node: RawValueNode): boolean {
  return (
    node.kind === "scalar" &&
    (node.valueType === "number" || node.valueType === "bigint")
  );
}

function nodePreview(node: RawValueNode): string {
  switch (node.kind) {
    case "scalar":
      if (node.valueType === "string") {
        return `"${node.value}${node.truncated ? "…" : ""}"`;
      }
      return node.value;
    case "bytes":
      return `bytes(${node.byteLength.toLocaleString()}) ${node.preview}${
        node.byteLength > 16 ? " …" : ""
      }`;
    case "object":
      return node.entries.length === 0
        ? "{}"
        : `{…} ${objectFieldCount(node).toLocaleString()} fields`;
    case "array":
      return node.items.length === 0 && node.totalLength === 0
        ? "[]"
        : node.totalLength > node.items.length
          ? `[…] showing ${node.items.length.toLocaleString()} of ${node.totalLength.toLocaleString()}`
          : `[…] ${node.totalLength.toLocaleString()} items`;
    case "truncated":
      return node.reason === "depth"
        ? "… deeper levels omitted"
        : "… omitted (size cap)";
  }
}

function objectFieldCount(node: RawObjectNode): number {
  return node.entries.length + (node.droppedEntries ?? 0);
}

function valueClassName(node: RawValueNode): string {
  if (node.kind === "scalar") {
    return node.valueType === "string"
      ? styles.valueString
      : styles.valueNumber;
  }
  if (node.kind === "truncated") {
    return styles.truncatedText;
  }
  return styles.valueSummary;
}

export default React.memo(StructuredMessageTree);
