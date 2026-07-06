import React, { useCallback, useEffect, useRef, useState } from "react";
import { rawNodeToJson } from "../resources/raw-record-prune";
import type { McapRawObjectNode, McapRawValueNode } from "../types";
import styles from "./McapRawMessageTile.module.css";

/** Levels expanded by default; deeper nodes open on demand. */
const AUTO_EXPAND_DEPTH = 2;

const COPY_FEEDBACK_MS = 1200;

/**
 * Collapsible tree over one pruned message record. Children render only
 * while their parent is expanded, so even a budget-maxed tree stays a
 * few hundred DOM nodes. Expansion state is keyed by field path and
 * lives across record refreshes — watching one value during playback
 * must not re-fold the tree every message.
 */
const McapRawMessageTree: React.FC<{
  readonly root: McapRawObjectNode;
}> = ({ root }) => {
  const [expandedOverrides, setExpandedOverrides] = useState<
    ReadonlyMap<string, boolean>
  >(new Map());
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // This effect clears a pending copy-feedback timer on unmount.
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    [],
  );

  const toggle = useCallback((path: string, expanded: boolean) => {
    setExpandedOverrides((previous) => {
      const next = new Map(previous);
      next.set(path, expanded);
      return next;
    });
  }, []);

  const copy = useCallback((path: string, node: McapRawValueNode) => {
    void navigator.clipboard?.writeText(
      JSON.stringify(rawNodeToJson(node), null, 2),
    );
    setCopiedPath(path);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(
      () => setCopiedPath(null),
      COPY_FEEDBACK_MS,
    );
  }, []);

  return (
    <div className={styles.tree} data-cy="mcap-raw-tree">
      {root.entries.map(([key, node]) => (
        <TreeRow
          copiedPath={copiedPath}
          copy={copy}
          depth={0}
          expandedOverrides={expandedOverrides}
          key={key}
          label={key}
          node={node}
          path={key}
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
  readonly copiedPath: string | null;
  readonly copy: (path: string, node: McapRawValueNode) => void;
  readonly depth: number;
  readonly expandedOverrides: ReadonlyMap<string, boolean>;
  readonly label: string;
  readonly node: McapRawValueNode;
  readonly path: string;
  readonly toggle: (path: string, expanded: boolean) => void;
}

function TreeRow({
  copiedPath,
  copy,
  depth,
  expandedOverrides,
  label,
  node,
  path,
  toggle,
}: TreeRowProps) {
  const expandable = isExpandable(node);
  const expanded =
    expandedOverrides.get(path) ?? (expandable && depth < AUTO_EXPAND_DEPTH);
  const indent = { paddingLeft: `${depth * 14}px` };

  return (
    <>
      <div className={styles.row} data-cy={`mcap-raw-node-${path}`}>
        <div className={styles.rowMain} style={indent}>
          {expandable ? (
            <button
              aria-expanded={expanded}
              aria-label={`Toggle ${label}`}
              className={styles.chevron}
              data-cy={`mcap-raw-toggle-${path}`}
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
        <button
          aria-label={`Copy ${label}`}
          className={styles.copyButton}
          data-cy={`mcap-raw-copy-${path}`}
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
              copiedPath={copiedPath}
              copy={copy}
              depth={depth + 1}
              expandedOverrides={expandedOverrides}
              key={childKey}
              label={childKey}
              node={child}
              path={`${path}.${childKey}`}
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
              copiedPath={copiedPath}
              copy={copy}
              depth={depth + 1}
              expandedOverrides={expandedOverrides}
              key={index}
              label={String(index)}
              node={item}
              path={`${path}.${index}`}
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
