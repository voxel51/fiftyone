import { KeypointOverlay, useLighter } from "@fiftyone/lighter";
import type { KeypointAnnotationLabel } from "@fiftyone/state";
import {
  Align,
  Clickable,
  FormField,
  Input,
  InputType,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useHandleSchemaChange } from "./AnnotationSchema";
import { useAnnotationContext } from "./useAnnotationContext";
import { useGuidedKeypoints } from "./useKeypointMode";

const isPlaced = (point: readonly unknown[] | undefined): boolean =>
  typeof point?.[0] === "number" &&
  Number.isFinite(point[0]) &&
  typeof point[1] === "number" &&
  Number.isFinite(point[1]);

const NodeList = styled.div`
  max-height: 16rem;
  overflow-y: auto;
`;

const NodeRow = styled.div<{ $active: boolean; $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.125rem 0.25rem;
  border-radius: var(--radius-xs);
  cursor: pointer;
  background: ${({ $active, $selected, theme }) =>
    $selected
      ? theme.primary.softBg
      : $active
        ? theme.neutral.softBg
        : "transparent"};

  &:hover {
    background: ${({ $selected, theme }) =>
      $selected ? theme.primary.softBg : theme.neutral.softBg};
  }
`;

type NodeStatus = "placed" | "skipped" | "target" | "pending";

const STATUS_MARK: Record<NodeStatus, string> = {
  placed: "✓",
  skipped: "–",
  target: "▸",
  pending: "○",
};

/** Statuses rendered in the muted text color. */
const MUTED_STATUSES: ReadonlySet<NodeStatus> = new Set(["pending", "skipped"]);

// Fixed-width cell so the node name never shifts when the status mark
// changes glyph (✓ → ▸ etc. — the glyphs have different natural widths)
const MarkCell = styled.span`
  display: inline-flex;
  width: 1.25rem;
  justify-content: center;
  flex-shrink: 0;
`;

// Row action (Skip / Clear / Place): its own hover pill, so the affordance
// reads as a button distinct from the row's select-on-click
const RowAction = styled(Clickable)`
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-xs);
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.primary.softBg};
  }
`;

const InspectorPanel = styled.div`
  margin-top: 0.375rem;
  padding-top: 0.375rem;
  border-top: 1px solid ${({ theme }) => theme.neutral.softBorder};
`;

interface NodeInspectorProps {
  name: string;
  placed: boolean;
  confidence: number | null;
  readOnly: boolean;
  onCommitConfidence: (value: number | null) => void;
}

/**
 * Pinned per-node editor below the checklist (deliberately outside its
 * scroll region — the node list is height-capped, so an inline accordion
 * would clip its own form). Confidence is the core per-point attribute
 * (`Keypoint.confidence`, parallel to `points`); edits commit on blur/Enter
 * through the same engine transaction the schema form uses.
 */
const NodeInspector = ({
  name,
  placed,
  confidence,
  readOnly,
  onCommitConfidence,
}: NodeInspectorProps) => {
  const [draft, setDraft] = useState(
    confidence === null ? "" : String(confidence),
  );

  // External changes (undo, another client) refresh the field; while typing,
  // `confidence` only moves on our own blur-commit, so this never fights the
  // user's keystrokes
  useEffect(() => {
    setDraft(confidence === null ? "" : String(confidence));
  }, [confidence]);

  const commit = () => {
    if (readOnly || !placed) return;
    if (draft.trim() === "") {
      if (confidence !== null) onCommitConfidence(null);
      return;
    }
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(confidence === null ? "" : String(confidence));
      return;
    }
    const clamped = Math.min(1, Math.max(0, parsed));
    setDraft(String(clamped));
    if (clamped !== confidence) onCommitConfidence(clamped);
  };

  return (
    <InspectorPanel data-cy="keypoint-node-inspector">
      <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
        <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
          selected point
        </Text>
        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          spacing={Spacing.Sm}
        >
          <Text>{name}</Text>
          <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
            {placed ? "placed" : "not placed"}
          </Text>
        </Stack>
        <FormField
          label="confidence"
          disabled={readOnly || !placed}
          control={
            <Input
              type={InputType.Number}
              min={0}
              max={1}
              step={0.01}
              style={{ width: "100%" }}
              value={draft}
              disabled={readOnly || !placed}
              placeholder={placed ? "0–1" : "no point"}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              data-cy="keypoint-confidence-input"
            />
          }
        />
      </Stack>
    </InspectorPanel>
  );
};

/**
 * Keypoint edit details. For skeleton fields, a per-node checklist driven by
 * the label's live geometry — a node is placed iff its point is finite (holes
 * are `[NaN, NaN]`, see the keypoints user guide). During guided placement
 * the target row is highlighted and offers Skip; skipped nodes stay holes.
 * Free-form fields (no skeleton) show a point-count summary.
 */
export const KeypointDetails = () => {
  const { selected } = useAnnotationContext();
  const {
    nodeLabels,
    nodeCount,
    points,
    targetIndex,
    skipped,
    skip,
    clearNode,
    placeNode,
    selectedNodeIndex,
    selectNode,
    isDraft,
  } = useGuidedKeypoints();

  const isReadOnly = selected?.isFieldReadOnly ?? false;
  const handleSchemaChange = useHandleSchemaChange(isReadOnly);

  // Core per-point attribute: `confidence` is a float list parallel to
  // `points` (absent entries are null; the NaN wire encoding covers it)
  const confidences =
    (selected?.data as { confidence?: (number | null)[] } | null)?.confidence ??
    null;

  const setNodeConfidence = useCallback(
    (index: number, value: number | null) => {
      const next = Array.from({ length: nodeCount }, (_, i) =>
        i === index ? value : (confidences?.[i] ?? null),
      );
      void handleSchemaChange({ confidence: next });
    },
    [confidences, handleSchemaChange, nodeCount],
  );

  // Keep the target row visible as placement advances — on a many-node
  // skeleton the next node must never require manual scrolling
  const targetRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    targetRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [targetIndex]);

  // Hovering a node row emphasizes its point on the canvas (a static radius
  // bump — deliberately no animation), answering "which dot is this node?"
  // on dense skeletons. Holes draw nothing, so hovering a skipped/pending
  // row is naturally a no-op.
  const { scene } = useLighter();
  const overlayId = selected?.overlay?.id;
  const hoverNode = useCallback(
    (index: number | null) => {
      const overlay = overlayId ? scene?.getOverlay(overlayId) : undefined;
      if (overlay instanceof KeypointOverlay) {
        overlay.setHoveredPoint(index);
      }
    },
    [overlayId, scene],
  );
  // Never leave a stale emphasis behind when this panel unmounts or the
  // selection moves to another label
  useEffect(() => () => hoverNode(null), [hoverNode]);

  // Fall back to the label data when no live overlay is available (e.g. a
  // selected track on a frame outside its extent)
  const dataPoints = (selected?.data as KeypointAnnotationLabel["data"] | null)
    ?.points;
  const currentPoints = points ?? dataPoints ?? [];

  // A skeleton is at most a few dozen nodes; no memoization needed
  const placedCount = currentPoints.filter((p) => isPlaced(p)).length;

  if (!nodeCount) {
    return (
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Sm}
        style={{ padding: "0.25rem" }}
      >
        <Text color={TextColor.Secondary}>
          {placedCount} point{placedCount === 1 ? "" : "s"}
        </Text>
      </Stack>
    );
  }

  const skippedCount = skipped.filter(
    (i) => !isPlaced(currentPoints[i]),
  ).length;

  return (
    <Stack
      orientation={Orientation.Column}
      spacing={Spacing.Xs}
      style={{ padding: "0.25rem" }}
    >
      <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
        {placedCount} of {nodeCount} placed
        {skippedCount > 0 ? ` · ${skippedCount} skipped` : ""}
      </Text>

      <NodeList data-cy="keypoint-node-list">
        {Array.from({ length: nodeCount }, (_, i) => {
          const placed = isPlaced(currentPoints[i]);
          const status: NodeStatus = placed
            ? "placed"
            : i === targetIndex
              ? "target"
              : skipped.includes(i)
                ? "skipped"
                : "pending";
          const name = nodeLabels?.[i] ?? `point ${i + 1}`;

          return (
            <NodeRow
              key={i}
              ref={status === "target" ? targetRowRef : undefined}
              $active={status === "target"}
              $selected={i === selectedNodeIndex}
              data-cy={`keypoint-node-${i}`}
              data-cy-status={status}
              onMouseEnter={() => hoverNode(i)}
              onMouseLeave={() => hoverNode(null)}
              onClick={() => selectNode(i === selectedNodeIndex ? null : i)}
            >
              <Stack
                orientation={Orientation.Row}
                align={Align.Center}
                spacing={Spacing.Sm}
              >
                <MarkCell>
                  <Text
                    color={
                      MUTED_STATUSES.has(status)
                        ? TextColor.Secondary
                        : TextColor.Fg
                    }
                  >
                    {STATUS_MARK[status]}
                  </Text>
                </MarkCell>
                <Text
                  color={
                    MUTED_STATUSES.has(status)
                      ? TextColor.Secondary
                      : TextColor.Fg
                  }
                >
                  {name}
                </Text>
              </Stack>

              {status === "target" && (
                <RowAction
                  onClick={(e) => {
                    e.stopPropagation();
                    skip();
                  }}
                  data-cy="keypoint-skip-node"
                >
                  <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
                    Skip
                  </Text>
                </RowAction>
              )}
              {status === "placed" && (
                <RowAction
                  onClick={(e) => {
                    e.stopPropagation();
                    clearNode(i);
                  }}
                  data-cy={`keypoint-clear-node-${i}`}
                >
                  <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
                    Clear
                  </Text>
                </RowAction>
              )}
              {(status === "skipped" || status === "pending") && (
                <RowAction
                  onClick={(e) => {
                    e.stopPropagation();
                    placeNode(i);
                  }}
                  data-cy={`keypoint-place-node-${i}`}
                >
                  <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
                    Place
                  </Text>
                </RowAction>
              )}
            </NodeRow>
          );
        })}
      </NodeList>

      {selectedNodeIndex !== null && !isDraft && (
        <NodeInspector
          key={`${selected?.overlay?.id ?? ""}-${selectedNodeIndex}`}
          name={
            nodeLabels?.[selectedNodeIndex] ?? `point ${selectedNodeIndex + 1}`
          }
          placed={isPlaced(currentPoints[selectedNodeIndex])}
          confidence={confidences?.[selectedNodeIndex] ?? null}
          readOnly={isReadOnly}
          onCommitConfidence={(value) =>
            setNodeConfidence(selectedNodeIndex, value)
          }
        />
      )}
    </Stack>
  );
};
