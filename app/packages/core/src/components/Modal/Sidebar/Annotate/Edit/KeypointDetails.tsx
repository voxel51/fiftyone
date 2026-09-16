import { KeypointOverlay, useLighter } from "@fiftyone/lighter";
import type { KeypointAnnotationLabel } from "@fiftyone/state";
import {
  Align,
  Clickable,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useCallback, useEffect, useRef } from "react";
import styled from "styled-components";
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
  background: ${({ $active, $selected, theme }) =>
    $selected
      ? theme.primary.softBg
      : $active
        ? theme.neutral.softBg
        : "transparent"};
`;

type NodeStatus = "placed" | "skipped" | "target" | "pending";

const STATUS_MARK: Record<NodeStatus, string> = {
  placed: "✓",
  skipped: "–",
  target: "▸",
  pending: "○",
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
  } = useGuidedKeypoints();

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
            >
              <Clickable
                onClick={() => selectNode(i === selectedNodeIndex ? null : i)}
                data-cy={`keypoint-select-node-${i}`}
              >
                <Stack
                  orientation={Orientation.Row}
                  align={Align.Center}
                  spacing={Spacing.Sm}
                >
                  <Text
                    color={
                      status === "pending" || status === "skipped"
                        ? TextColor.Secondary
                        : TextColor.Fg
                    }
                  >
                    {STATUS_MARK[status]}
                  </Text>
                  <Text
                    color={
                      status === "pending" || status === "skipped"
                        ? TextColor.Secondary
                        : TextColor.Fg
                    }
                  >
                    {name}
                  </Text>
                </Stack>
              </Clickable>

              {status === "target" && (
                <Clickable onClick={skip} data-cy="keypoint-skip-node">
                  <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
                    Skip
                  </Text>
                </Clickable>
              )}
              {status === "placed" && (
                <Clickable
                  onClick={() => clearNode(i)}
                  data-cy={`keypoint-clear-node-${i}`}
                >
                  <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
                    Clear
                  </Text>
                </Clickable>
              )}
              {(status === "skipped" || status === "pending") && (
                <Clickable
                  onClick={() => placeNode(i)}
                  data-cy={`keypoint-place-node-${i}`}
                >
                  <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
                    Place
                  </Text>
                </Clickable>
              )}
            </NodeRow>
          );
        })}
      </NodeList>
    </Stack>
  );
};
