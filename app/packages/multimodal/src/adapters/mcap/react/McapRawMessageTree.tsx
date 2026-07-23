import React, { useCallback, useState } from "react";
import { rawNodeToJson } from "../resources/raw-record-prune";
import type { McapRawObjectNode, McapRawValueNode } from "../types";
import styles from "./McapRawMessageTile.module.css";
import { useCopyFeedback } from "./use-copy-feedback";

/** Levels expanded by default; deeper nodes open on demand. */
const AUTO_EXPAND_DEPTH = 2;

export interface McapRawMessageTreeProps {
  readonly onAddNumericFieldToPlot?: (path: string) => void;
  readonly plottableFieldPaths?: ReadonlySet<string>;
  readonly root: McapRawObjectNode;
}

/**
 * Collapsible tree over one pruned message record. Children render only
 * while their parent is expanded, so even a budget-maxed tree stays a
 * few hundred DOM nodes. Expansion state is keyed by field path and
 * lives across record refreshes — watching one value during playback
 * must not re-fold the tree every message.
 */
const McapRawMessageTree: React.FC<McapRawMessageTreeProps> = ({
  onAddNumericFieldToPlot,
  plottableFieldPaths,
  root,
}) => {
  const [expandedOverrides, setExpandedOverrides] = useState<
    ReadonlyMap<string, boolean>
  >(new Map());
  const [copiedPath, showCopiedPath] = useCopyFeedback<string | null>(null);
  const [plottedPath, showPlottedPath] = useCopyFeedback<string | null>(null);

  const toggle = useCallback((path: string, expanded: boolean) => {
    setExpandedOverrides((previous) => {
      const next = new Map(previous);
      next.set(path, expanded);
      return next;
    });
  }, []);

  const copy = useCallback(
    (path: string, node: McapRawValueNode) => {
      void navigator.clipboard?.writeText(
        JSON.stringify(rawNodeToJson(node), null, 2),
      );
      showCopiedPath(path);
    },
    [showCopiedPath],
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
  const effectivePlottableFieldPaths = onAddNumericFieldToPlot
    ? plottableFieldPaths
    : undefined;

  return (
    <div className={styles.tree} data-testid="mcap-raw-tree">
      {root.entries.map(([key, node]) => (
        <TreeRow
          addToPlot={addToPlot}
          copiedPath={copiedPath}
          copy={copy}
          depth={0}
          expandedOverrides={expandedOverrides}
          key={key}
          label={key}
          node={node}
          path={key}
          plottableFieldPaths={effectivePlottableFieldPaths}
          plottedPath={plottedPath}
          toggle={toggle}
        />
      ))}
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
  readonly addToPlot: (path: string) => void;
  readonly copiedPath: string | null;
  readonly copy: (path: string, node: McapRawValueNode) => void;
  readonly depth: number;
  readonly expandedOverrides: ReadonlyMap<string, boolean>;
  readonly label: string;
  readonly node: McapRawValueNode;
  readonly path: string;
  readonly plottableFieldPaths?: ReadonlySet<string>;
  readonly plottedPath: string | null;
  readonly toggle: (path: string, expanded: boolean) => void;
}

function TreeRow({
  addToPlot,
  copiedPath,
  copy,
  depth,
  expandedOverrides,
  label,
  node,
  path,
  plottableFieldPaths,
  plottedPath,
  toggle,
}: TreeRowProps) {
  const expandable = isExpandable(node);
  const expanded =
    expandedOverrides.get(path) ?? (expandable && depth < AUTO_EXPAND_DEPTH);
  const indent = { paddingLeft: `${depth * 14}px` };
  const canAddToPlot =
    isPlottableScalar(node) && plottableFieldPaths?.has(path);
  const addToPlotLabel =
    plottedPath === path ? `${path} plotted` : `Add ${path} to plot`;

  return (
    <>
      <div className={styles.row} data-testid={`mcap-raw-node-${path}`}>
        <div className={styles.rowMain} style={indent}>
          {expandable ? (
            <button
              aria-expanded={expanded}
              aria-label={`Toggle ${label}`}
              className={styles.chevron}
              data-testid={`mcap-raw-toggle-${path}`}
              onClick={() => toggle(path, !expanded)}
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
            data-testid={`mcap-raw-plot-${path}`}
            onClick={() => addToPlot(path)}
            title="Add field to plot"
            type="button"
          >
            {plottedPath === path ? "plotted" : "plot"}
          </button>
        ) : null}
        <button
          aria-label={`Copy ${label}`}
          className={styles.copyButton}
          data-testid={`mcap-raw-copy-${path}`}
          onClick={() => copy(path, node)}
          title="Copy subtree as JSON"
          type="button"
        >
          {copiedPath === path ? "copied" : "copy"}
        </button>
      </div>
      {expanded && node.kind === "object"
        ? node.entries.map(([childKey, child]) => (
            <TreeRow
              addToPlot={addToPlot}
              copiedPath={copiedPath}
              copy={copy}
              depth={depth + 1}
              expandedOverrides={expandedOverrides}
              key={childKey}
              label={childKey}
              node={child}
              path={`${path}.${childKey}`}
              plottableFieldPaths={plottableFieldPaths}
              plottedPath={plottedPath}
              toggle={toggle}
            />
          ))
        : null}
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
              copiedPath={copiedPath}
              copy={copy}
              depth={depth + 1}
              expandedOverrides={expandedOverrides}
              key={index}
              label={String(index)}
              node={item}
              path={`${path}.${index}`}
              plottableFieldPaths={plottableFieldPaths}
              plottedPath={plottedPath}
              toggle={toggle}
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
}

function isExpandable(node: McapRawValueNode): boolean {
  return (
    (node.kind === "object" && node.entries.length > 0) ||
    (node.kind === "array" && node.items.length > 0)
  );
}

function isPlottableScalar(node: McapRawValueNode): boolean {
  return (
    node.kind === "scalar" &&
    (node.valueType === "number" || node.valueType === "bigint")
  );
}

function nodePreview(node: McapRawValueNode): string {
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

function objectFieldCount(node: McapRawObjectNode): number {
  return node.entries.length + (node.droppedEntries ?? 0);
}

function valueClassName(node: McapRawValueNode): string {
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

export default McapRawMessageTree;
