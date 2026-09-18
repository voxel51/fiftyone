import { KeypointOverlay, useLighter } from "@fiftyone/lighter";
import type { KeypointAnnotationLabel } from "@fiftyone/state";
import {
  Align,
  Clickable,
  FormField,
  Heading,
  HeadingLevel,
  Input,
  InputType,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
} from "@voxel51/voodo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { useHandleSchemaChange } from "./AnnotationSchema";
import {
  buildPointAttributeList,
  CONFIDENCE_FALLBACK_SPEC,
  getPointAttributeSpecs,
  toPointAttributeValue,
  type PointAttributeSpec,
  type PointAttributeValue,
} from "./keypointPointAttributes";
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
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid ${({ theme }) => theme.neutral.softBorder};
`;

const InspectorHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const InspectorHeading = styled(Heading)`
  margin: 0;
`;

interface AttributeInputProps {
  spec: PointAttributeSpec;
  value: PointAttributeValue;
  placed: boolean;
  disabled: boolean;
  onCommit: (value: PointAttributeValue) => void;
}

/**
 * Number editor for float/int point attributes; commits on blur/Enter,
 * clamped to the attribute's range when it declares one. An empty field
 * commits null, which the write path stores as the type's hole filler.
 */
const NumberAttributeInput = ({
  spec,
  value,
  placed,
  disabled,
  onCommit,
}: AttributeInputProps) => {
  const current = typeof value === "number" ? value : null;
  const [draft, setDraft] = useState(current === null ? "" : String(current));

  // External changes (undo, another client) refresh the field; while typing,
  // the value only moves on our own blur-commit, so this never fights the
  // user's keystrokes
  useEffect(() => {
    setDraft(current === null ? "" : String(current));
  }, [current]);

  const commit = () => {
    if (disabled) return;
    if (draft.trim() === "") {
      if (current !== null) onCommit(null);
      return;
    }
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(current === null ? "" : String(current));
      return;
    }
    let next = spec.type === "int" ? Math.trunc(parsed) : parsed;
    if (spec.range) {
      next = Math.min(spec.range[1], Math.max(spec.range[0], next));
    }
    setDraft(String(next));
    if (next !== current) onCommit(next);
  };

  return (
    <FormField
      label={spec.name}
      disabled={disabled}
      control={
        <Input
          type={InputType.Number}
          min={spec.range?.[0]}
          max={spec.range?.[1]}
          step={spec.type === "int" ? 1 : 0.01}
          style={{ width: "100%" }}
          value={draft}
          disabled={disabled}
          placeholder={
            placed
              ? spec.range
                ? `${spec.range[0]}–${spec.range[1]}`
                : "number"
              : "no point"
          }
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
          data-cy={`keypoint-${spec.name}-input`}
        />
      }
    />
  );
};

/**
 * Free-text editor for str point attributes without a values list; commits
 * on blur/Enter. An empty field commits null (unset).
 */
const TextAttributeInput = ({
  spec,
  value,
  placed,
  disabled,
  onCommit,
}: AttributeInputProps) => {
  const current = typeof value === "string" ? value : null;
  const [draft, setDraft] = useState(current ?? "");

  useEffect(() => {
    setDraft(current ?? "");
  }, [current]);

  const commit = () => {
    if (disabled) return;
    if (draft === "") {
      if (current !== null) onCommit(null);
      return;
    }
    if (draft !== current) onCommit(draft);
  };

  return (
    <FormField
      label={spec.name}
      disabled={disabled}
      control={
        <Input
          type={InputType.Text}
          style={{ width: "100%" }}
          value={draft}
          disabled={disabled}
          placeholder={placed ? "value" : "no point"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
          data-cy={`keypoint-${spec.name}-input`}
        />
      }
    />
  );
};

/** One point attribute editor, dispatched on the schema's element type. */
const PointAttributeField = ({
  spec,
  value,
  placed,
  readOnly,
  onCommit,
}: Omit<AttributeInputProps, "disabled"> & { readOnly: boolean }) => {
  const disabled = readOnly || !placed || !!spec.readOnly;

  if (spec.type === "bool") {
    return (
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Sm}
      >
        <Text>{spec.name}</Text>
        <Toggle
          checked={value === true}
          onChange={(checked: boolean) => onCommit(checked)}
          size={Size.Sm}
          disabled={disabled}
          data-cy={`keypoint-${spec.name}-toggle`}
        />
      </Stack>
    );
  }

  if (spec.type === "str" && spec.values?.length) {
    return (
      <FormField
        label={spec.name}
        disabled={disabled}
        control={
          <Select
            exclusive
            portal
            value={typeof value === "string" ? value : ""}
            onChange={(next) => {
              if (typeof next === "string") onCommit(next);
            }}
            options={(spec.values ?? []).map((v) => ({
              id: String(v),
              data: { label: String(v) },
            }))}
            disabled={disabled}
          />
        }
      />
    );
  }

  if (spec.type === "str") {
    return (
      <TextAttributeInput
        spec={spec}
        value={value}
        placed={placed}
        disabled={disabled}
        onCommit={onCommit}
      />
    );
  }

  return (
    <NumberAttributeInput
      spec={spec}
      value={value}
      placed={placed}
      disabled={disabled}
      onCommit={onCommit}
    />
  );
};

interface NodeInspectorProps {
  name: string;
  placed: boolean;
  index: number;
  attributes: PointAttributeSpec[];
  data: Record<string, unknown> | null | undefined;
  readOnly: boolean;
  onCommit: (spec: PointAttributeSpec, value: PointAttributeValue) => void;
}

/**
 * Pinned per-node editor below the checklist (deliberately outside its
 * scroll region — the node list is height-capped, so an inline accordion
 * would clip its own form). Renders one editor per point-scoped attribute
 * (parallel lists, see keypointPointAttributes.ts); edits commit through
 * the same engine transaction the schema form uses.
 */
const NodeInspector = ({
  name,
  placed,
  index,
  attributes,
  data,
  readOnly,
  onCommit,
}: NodeInspectorProps) => (
  <InspectorPanel data-cy="keypoint-node-inspector">
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <InspectorHeader>
        <InspectorHeading level={HeadingLevel.H4}>
          Selected point
        </InspectorHeading>
        <Text color={TextColor.Secondary} variant={TextVariant.Sm}>
          {placed ? "placed" : "not placed"}
        </Text>
      </InspectorHeader>
      <Text>{name}</Text>
      {attributes.map((spec) => {
        const list = data?.[spec.name];
        return (
          <PointAttributeField
            key={spec.name}
            spec={spec}
            value={toPointAttributeValue(
              spec.type,
              Array.isArray(list) ? list[index] : undefined,
            )}
            placed={placed}
            readOnly={readOnly}
            onCommit={(value) => onCommit(spec, value)}
          />
        );
      })}
    </Stack>
  </InspectorPanel>
);

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
  const config = selected?.schema ?? null;

  // The inspector's editors: the schema's point-scoped attributes, with
  // confidence offered even when no schema declares it
  const pointAttributes = useMemo(() => {
    const declared = getPointAttributeSpecs(
      Array.isArray(config?.attributes) ? config.attributes : undefined,
    );
    return declared.some((spec) => spec.name === "confidence")
      ? declared
      : [CONFIDENCE_FALLBACK_SPEC, ...declared];
  }, [config]);

  const labelData = selected?.data as Record<string, unknown> | null;

  // Commits the full-length parallel list — unset entries take the element
  // type's hole filler (see keypointPointAttributes.ts for why float uses
  // NaN and the other types use null)
  const setNodeAttribute = useCallback(
    (spec: PointAttributeSpec, index: number, value: PointAttributeValue) => {
      const existing = labelData?.[spec.name];
      const next = buildPointAttributeList(
        spec.type,
        Array.isArray(existing) ? existing : undefined,
        nodeCount,
        index,
        value,
      );
      void handleSchemaChange({ [spec.name]: next });
    },
    [labelData, handleSchemaChange, nodeCount],
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
          index={selectedNodeIndex}
          attributes={pointAttributes}
          data={labelData}
          readOnly={isReadOnly}
          onCommit={(spec, value) =>
            setNodeAttribute(spec, selectedNodeIndex, value)
          }
        />
      )}
    </Stack>
  );
};
