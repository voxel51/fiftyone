import {
  KeypointOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import type { KeypointAnnotationLabel } from "@fiftyone/state";
import { KEYPOINT } from "@fiftyone/utilities";
import { useCallback, useMemo, useReducer } from "react";
import { useAnnotationSchemaContext } from "../state";
import type { AttributeConfig } from "../SchemaManager/utils";
import { useAnnotationContext } from "./state";
import { LabelSchemaMeta } from "../useSchemaManager";

/**
 * Reserved label fields that should never be treated as per-point attributes
 * even if their length happens to match the point count.
 */
const RESERVED_KEYS = new Set(["points"]);

/**
 * Returns the set of label fields that should be treated as per-point
 * attributes for a keypoint label — any field whose value is an array with
 * `length === points.length` (excluding {@link RESERVED_KEYS}). Returns an
 * empty set when the input doesn't have a usable points array.
 */
export const getPerPointAttributeNames = (
  data: KeypointAnnotationLabel["data"] | undefined
): Set<string> => {
  const names = new Set<string>();
  const points = data?.points;
  if (!Array.isArray(points)) {
    return names;
  }

  for (const [name, value] of Object.entries(data ?? {})) {
    if (RESERVED_KEYS.has(name)) {
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    if (value.length !== points.length) {
      continue;
    }

    names.add(name);
  }

  return names;
};

/**
 * Hook variant of {@link getPerPointAttributeNames} that resolves the current
 * label automatically. Returns an empty set when the active label is not a
 * keypoint, so consumers can apply it unconditionally.
 */
export const usePerPointAttributeNames = (): Set<string> => {
  const { selectedLabel } = useAnnotationContext();

  return useMemo(() => {
    if (selectedLabel?.type !== KEYPOINT) {
      return new Set<string>();
    }

    return getPerPointAttributeNames(
      selectedLabel.data as KeypointAnnotationLabel["data"]
    );
  }, [selectedLabel]);
};

/**
 * Per-point attribute surfaced for the currently sub-selected vertex.
 */
export interface KeypointAttribute {
  /** Field name on the parent label (e.g. "occluded", "confidence") */
  name: string;
  /** Value for the currently-selected point */
  value: unknown;
  /** Matching schema entry, when one is defined for this attribute */
  schema?: AttributeConfig;
}

export interface KeypointMeta {
  /** Index of the sub-selected point on the keypoint overlay */
  pointIndex: number;
  /** Total number of points on the keypoint label */
  pointCount: number;
  /** Per-point attributes inferred from the label data */
  attributes: KeypointAttribute[];
}

/**
 * Get the per-point attributes for the provided point index.
 *
 * @param label Keypoint label containing source data
 * @param pointIndex Point index
 * @param schema Field schema
 */
export const getKeypointAttributes = (
  label: KeypointAnnotationLabel["data"] | null,
  pointIndex: number | null,
  schema: LabelSchemaMeta | null
): KeypointMeta | null => {
  if (pointIndex === null) {
    return null;
  }

  const points = label?.points;
  if (!Array.isArray(points) || pointIndex >= points.length) {
    return null;
  }

  const schemaAttributes =
    (schema?.label_schema?.attributes as unknown as
      | AttributeConfig[]
      | undefined) ?? [];
  const schemaByName = new Map(schemaAttributes.map((a) => [a.name, a]));

  const perPointNames = getPerPointAttributeNames(label);
  const attributes: KeypointAttribute[] = [];
  for (const name of perPointNames) {
    const list = (label as Record<string, unknown>)[name] as unknown[];
    attributes.push({
      name,
      value: list[pointIndex],
      schema: schemaByName.get(name),
    });
  }

  return {
    pointIndex,
    pointCount: points.length,
    attributes,
  };
};

/**
 * Returns the currently active keypoint overlay (when a keypoint label is
 * being edited), or `null` otherwise.
 */
export const useSelectedKeypointOverlay = (): KeypointOverlay | null => {
  const { selectedLabel } = useAnnotationContext();

  if (
    selectedLabel?.type !== KEYPOINT ||
    !(selectedLabel.overlay instanceof KeypointOverlay)
  ) {
    return null;
  }

  return selectedLabel.overlay;
};

/**
 * Tracks the sub-selected point index for the currently active keypoint
 * overlay, reacting to {@link KeypointOverlay} sub-selection events. Returns
 * `null` when no keypoint label is being edited or no point is sub-selected.
 */
export const useSelectedKeypointIndex = (): number | null => {
  const overlay = useSelectedKeypointOverlay();
  const { scene } = useLighter();
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  // stateless re-render trigger
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEventHandler(
    "lighter:keypoint-sub-selection-changed",
    useCallback(
      (payload) => {
        if (!overlay || payload.id !== overlay.id) {
          return;
        }

        forceUpdate();
      },
      [overlay]
    )
  );

  return overlay?.getSelectedPointIndex() ?? null;
};

/**
 * Returns information about the currently sub-selected point of the active
 * keypoint overlay, or `null` when no keypoint label is being edited or no
 * point has been selected within it.
 *
 * Per-point attributes are inferred from the label's data: any field whose
 * value is an array with `length === points.length` (excluding `points`
 * itself) is treated as a per-point list, per the FiftyOne keypoint
 * documentation.
 */
export const useSelectedKeypoint = (): KeypointMeta | null => {
  const { selectedLabel } = useAnnotationContext();
  const pointIndex = useSelectedKeypointIndex();
  const { labelSchema } = useAnnotationSchemaContext();

  const fieldSchema = labelSchema?.[selectedLabel?.path];

  return useMemo(() => {
    if (selectedLabel?.type !== "Keypoint") {
      return null;
    }

    return getKeypointAttributes(selectedLabel?.data, pointIndex, fieldSchema);
  }, [pointIndex, selectedLabel, fieldSchema]);
};
