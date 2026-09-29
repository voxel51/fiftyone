import { atom, useAtom, useAtomValue, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { capitalize } from "lodash";
import { LabelSchemaMeta } from "./useSchemaManager";
import { useCallback, useMemo } from "react";
import { PRIMITIVE_FIELD_TYPES } from "./SchemaManager/constants";
import type {
  ResolvedLabelSchemaDoc,
  StageFieldAccess,
  StageFieldPolicy,
  StageSchemaPolicy,
} from "./schemaPolicyTypes";

// Tab state for GUI/JSON toggle
export const activeSchemaTab = atom<"gui" | "json">("gui");

export const currentField = atom<null | string>();

/**
 * The dataset the schema atoms below describe — bridged from Recoil's
 * `datasetName` by `useSyncSchemaDataset` (a Jotai getter can't read
 * Recoil). The atoms are global, so they are scoped on it: a value
 * written for one dataset reads as "not loaded" (`null`) under any
 * other, instantly, instead of showing the previous dataset's schemas
 * until some loader happens to refetch.
 */
export const schemaDatasetName = atom<string | null>(null);

/**
 * A writable atom whose value belongs to the dataset it was written
 * under: reads return `initial` whenever `schemaDatasetName` no longer
 * matches the dataset the value was written for.
 */
const datasetScopedAtom = <T>(initial: T) => {
  const store = atom<{ dataset: string | null; value: T }>({
    dataset: null,
    value: initial,
  });
  return atom(
    (get) => {
      const { dataset, value } = get(store);
      return dataset === get(schemaDatasetName) ? value : initial;
    },
    (get, set, value: T) => {
      set(store, { dataset: get(schemaDatasetName), value });
    },
  );
};

export const labelSchemasData = datasetScopedAtom<Record<
  string,
  LabelSchemaMeta
> | null>(null);

// =============================================================================
// Stage schema policy (workflow task overlays)
// =============================================================================

export type {
  StageFieldAccess,
  StageFieldPolicy,
  StageSchemaPolicy,
} from "./schemaPolicyTypes";

/**
 * `schema_policy` payload from `get_task_workspace`: the active task's
 * stage `schema_overlay`, resolved server-side. Applies to everyone who
 * opens the task — managers included. Outside a task workspace this
 * atom is null = "unrestricted", i.e. the pre-overlay world.
 *
 * Bridged from TaskContext (React context → Jotai, same pattern as
 * `exploreActiveFields`) by `SchemaPolicyBridge`. Null when no task is
 * active or the stage has no overlay.
 */
export const taskSchemaPolicy: PrimitiveAtom<StageSchemaPolicy | null> =
  atom<StageSchemaPolicy | null>(null);

/**
 * The active task's stage-referenced label-schema DOC, resolved
 * server-side (`get_task_workspace.label_schema_doc`). When present it
 * IS the task's schema: `effectiveLabelSchemasData` returns its
 * envelope verbatim and `visibleLabelSchemas` uses its annotate-tier
 * list — the dataset-level schemas and the legacy overlay are not
 * consulted. Bridged by `SchemaPolicyBridge`, null outside tasks.
 */
export const taskLabelSchemaDoc: PrimitiveAtom<ResolvedLabelSchemaDoc | null> =
  atom<ResolvedLabelSchemaDoc | null>(null);

/**
 * The named label-schema doc OPEN FOR EDITING in the Schema Manager
 * (loose shape — content entries are FieldSchema-compatible dicts).
 * While set, `effectiveLabelSchemasData` overlays the doc's content
 * onto the envelope so the ENTIRE existing schema-editing surface
 * (EditFieldLabelSchema: classes/attribute forms, ontology, JSON,
 * scan) reads THIS schema's content — full configuration per named
 * schema, not just visibility. Writes go through the schema-doc
 * operators (see `useLabelSchema`'s doc branches), never the dataset.
 */
export interface ManagerSchemaDoc {
  id: string;
  name: string;
  label_schema: Record<string, Record<string, unknown>>;
  visibility: {
    default?: string;
    fields?: Record<
      string,
      { tier?: string; attributes?: Record<string, string> }
    >;
  };
  [key: string]: unknown;
}

export const managerSchemaDocId: PrimitiveAtom<string | null> = atom<
  string | null
>(null);

export const managerSchemaDoc: PrimitiveAtom<ManagerSchemaDoc | null> =
  atom<ManagerSchemaDoc | null>(null);

export const policyFieldAccess = (
  policy: StageSchemaPolicy | null | undefined,
  path: string,
): StageFieldAccess => {
  if (!policy) return "editable";
  return policy.fields[path]?.visibility ?? policy.default;
};

/**
 * Tri-state access for one attribute under a field's policy entry:
 * explicit name beats the `"*"` attribute wildcard beats "editable".
 * (No field-level fallthrough here — a read-only FIELD already locks
 * its attributes via the field-level stamp.)
 */
export const policyAttributeAccess = (
  fieldPolicy: StageFieldPolicy | undefined,
  name: string,
): StageFieldAccess => {
  const attrs = fieldPolicy?.attributes;
  if (!attrs) return "editable";
  return attrs[name] ?? attrs["*"] ?? "editable";
};

/** Same resolution for one class option under a field's policy entry. */
export const policyClassAccess = (
  fieldPolicy: StageFieldPolicy | undefined,
  name: string,
): StageFieldAccess => {
  const classes = fieldPolicy?.classes;
  if (!classes) return "editable";
  return classes[name] ?? classes["*"] ?? "editable";
};

/**
 * Whether a field's bbox (box/polyline) is locked: field-level
 * read-only locks everything, and the policy's `bbox` knob locks
 * just the spatial part while attribute inputs stay live.
 */
export const isFieldBboxLocked = (
  data: LabelSchemaMeta | undefined,
): boolean => {
  return isFieldReadOnly(data) || !!data?.bbox_read_only;
};

/**
 * Apply one field's policy to its meta: mask the `label_schema`
 * attributes (hidden attrs dropped — their inputs never render;
 * read-only attrs stamped — `AnnotationSchema` already disables inputs
 * with `attr.read_only`), then stamp field-level read-only. Returns the
 * original object when nothing changes.
 */
const applyPolicyToMeta = (
  meta: LabelSchemaMeta,
  fieldPolicy: StageFieldPolicy | undefined,
  access: StageFieldAccess,
): LabelSchemaMeta => {
  let next = meta;

  const attributes = meta?.label_schema?.attributes;
  if (fieldPolicy?.attributes && Array.isArray(attributes)) {
    const masked = attributes
      .filter(
        (attr) =>
          !attr?.name ||
          policyAttributeAccess(fieldPolicy, attr.name) !== "hidden",
      )
      .map((attr) =>
        attr?.name &&
        !attr.read_only &&
        policyAttributeAccess(fieldPolicy, attr.name) === "read_only"
          ? { ...attr, read_only: true }
          : attr,
      );
    const changed =
      masked.length !== attributes.length ||
      masked.some((attr, i) => attr !== attributes[i]);
    if (changed) {
      next = {
        ...next,
        label_schema: { ...next.label_schema, attributes: masked },
      };
    }
  }

  // The class ("label") input follows the attribute policy too: it is
  // not a schema attribute, but "Other attributes: View" plainly reads
  // as "I may only edit what was explicitly granted" — so the wildcard
  // (or an explicit "label" entry) locks it. Hidden clamps to locked:
  // the class input can't be removed from a rendered label.
  if (
    fieldPolicy?.attributes &&
    policyAttributeAccess(fieldPolicy, "label") !== "editable" &&
    !next.label_schema?.label_read_only
  ) {
    next = {
      ...next,
      label_schema: { ...next.label_schema, label_read_only: true },
    };
  }

  // Hidden classes drop out of the options list — the edit panel's
  // class picker renders whatever `classes` carries, so this narrows
  // the dropdown with no picker changes. Labels carrying an
  // out-of-scope class render but are class-locked (AnnotationSchema).
  const classes = next?.label_schema?.classes;
  if (fieldPolicy?.classes && Array.isArray(classes)) {
    const narrowed = classes.filter(
      (name) => policyClassAccess(fieldPolicy, name) !== "hidden",
    );
    if (narrowed.length !== classes.length) {
      next = {
        ...next,
        label_schema: { ...next.label_schema, classes: narrowed },
      };
    }
  }

  if (fieldPolicy?.bbox === "read_only" && !next.bbox_read_only) {
    next = { ...next, bbox_read_only: true };
  }

  if (access === "read_only" && !next.read_only) {
    next = { ...next, read_only: true };
  }
  return next;
};

/**
 * `labelSchemasData` with the task schema policy applied: read-only
 * fields get `read_only: true` stamped into their meta so every
 * existing `isFieldReadOnly` consumer (canvas drag gating, creation,
 * edit panel) enforces the policy with no knowledge of it. Identity
 * when no policy is active. Hidden fields are NOT removed here — the
 * visibility layer is `visibleLabelSchemas` + the task view's
 * server-side field exclusion.
 */
export const effectiveLabelSchemasData = atom((get) => {
  const doc = get(taskLabelSchemaDoc);
  if (doc) {
    // The resolved doc is already envelope-shaped (see
    // label_schema_docs.resolve) — masking/stamping happened
    // server-side, so it is returned verbatim.
    return doc.label_schemas as Record<string, LabelSchemaMeta>;
  }
  const raw = get(labelSchemasData);
  // Schema Manager doc-editing mode: overlay the OPEN doc's content
  // (unmasked — the editor needs every attribute, including hidden-tier
  // ones) onto the envelope. Fields the doc doesn't model still resolve
  // from the dataset map, so type hints and Setup flows keep working.
  const managerDoc = get(managerSchemaDoc);
  if (managerDoc) {
    const out: Record<string, LabelSchemaMeta> = { ...(raw ?? {}) };
    for (const [path, entry] of Object.entries(managerDoc.label_schema)) {
      out[path] = {
        label_schema: entry,
        default_label_schema: raw?.[path]?.default_label_schema ?? entry,
        type: (entry as { type?: string })?.type ?? raw?.[path]?.type,
        read_only: !!(entry as { read_only?: boolean })?.read_only,
        unsupported: false,
      } as unknown as LabelSchemaMeta;
    }
    return out;
  }
  const policy = get(taskSchemaPolicy);
  if (!raw || !policy) return raw;
  const out: Record<string, LabelSchemaMeta> = {};
  for (const [path, meta] of Object.entries(raw)) {
    out[path] = applyPolicyToMeta(
      meta,
      policy.fields[path],
      policyFieldAccess(policy, path),
    );
  }
  return out;
});

export const labelSchemaData = atomFamily((field: string) => {
  return atom(
    (get) => get(effectiveLabelSchemasData)?.[field],
    (get, set, value) => {
      set(labelSchemasData, { ...get(labelSchemasData), [field]: value });
    },
  );
});

export const activeLabelSchemas = datasetScopedAtom<string[] | null>(null);

/**
 * Mirror of Recoil activeFields({ modal: true }), written by Sidebar.tsx.
 * Can't read Recoil from inside a Jotai atom's getter, so we need the data
 * bridged into a Jotai atom. null means not yet initialized — in that case
 * visibleLabelSchemas treats the explore set as empty (only primitive fields
 * pass through).
 */
export const exploreActiveFields = atom<string[] | null>(null);

/**
 * Media type of the group slice currently being annotated, mirrored from Recoil
 * by `useSyncAnnotationSliceMediaType`. null when the dataset isn't grouped — in
 * that case visibleLabelSchemas applies no per-slice filtering. Recoil can't be
 * read from inside a Jotai getter, so the slice media type is bridged in (same
 * pattern as exploreActiveFields).
 */
export const annotationSliceMediaType = atom<string | null>(null);

const FRAMES_PREFIX = "frames.";
const CLASSIFICATION_TYPES = new Set(["classification", "classifications"]);
const TEMPORAL_TYPES = new Set(["temporaldetection", "temporaldetections"]);

/**
 * Whether an active-schema path is annotatable on a slice of the given media
 * type. In a grouped dataset the active schema is a superset across slices, so
 * navigating to a slice must hide the paths that slice can't carry:
 *   - frame fields (`frames.*`) exist only on video slices;
 *   - temporal detections span frames, so they're video-only;
 *   - spatial sample-level labels (detection/polyline/keypoint/seg) live in
 *     `frames.*` on video, so at the sample level they belong to image/3d;
 *   - classifications and primitive scalars are whole-sample — valid anywhere.
 * `sliceMediaType == null` means the dataset isn't grouped → no filtering.
 */
const isPathAnnotatableOnSlice = (
  path: string,
  rawType: string | undefined,
  isPrimitive: boolean,
  sliceMediaType: string | null,
): boolean => {
  if (sliceMediaType == null) {
    return true;
  }

  const isVideo = sliceMediaType === "video";

  if (path.startsWith(FRAMES_PREFIX)) {
    return isVideo;
  }

  if (isPrimitive) {
    return true;
  }

  const type = (rawType ?? "").toLowerCase();

  if (CLASSIFICATION_TYPES.has(type)) {
    return true;
  }

  if (TEMPORAL_TYPES.has(type)) {
    return isVideo;
  }

  return !isVideo;
};

/**
 * Intersection of activeLabelSchemas and exploreActiveFields, further narrowed
 * to the paths the current group slice supports (see isPathAnnotatableOnSlice).
 * Display consumers should read this instead of activeLabelSchemas so that
 * hiding a field in the Explore sidebar also hides it in Annotate, and so that
 * navigating between slices only offers schemas valid for the open slice.
 */
export const visibleLabelSchemas = atom((get) => {
  const doc = get(taskLabelSchemaDoc);
  if (doc) {
    // Doc mode: the annotate-tier list IS the contract — the explore
    // checkbox intersection must not narrow a stage's schema (a stale
    // sessionStorage active-fields set would silently drop doc fields).
    // Slice support still applies.
    const sliceMediaType = get(annotationSliceMediaType);
    return doc.active.filter((field) => {
      const meta = doc.label_schemas[field] as LabelSchemaMeta | undefined;
      const rawType = meta?.type ?? undefined;
      const isPrimitive =
        !!rawType && PRIMITIVE_FIELD_TYPES.has(capitalize(rawType));
      return isPathAnnotatableOnSlice(
        field,
        rawType,
        isPrimitive,
        sliceMediaType,
      );
    });
  }
  const active = get(activeLabelSchemas);
  if (!active) return [];

  const explore = get(exploreActiveFields);
  const exploreSet = new Set(explore ?? []);
  const sliceMediaType = get(annotationSliceMediaType);
  const policy = get(taskSchemaPolicy);

  return active.filter((field) => {
    // Stage policy: fields hidden for this task's viewer never surface,
    // regardless of explore/slice state.
    if (policyFieldAccess(policy, field) === "hidden") {
      return false;
    }

    const type = get(fieldType(field));
    // Primitive fields don't appear in the Explore sidebar — always show them.
    // Everything else is a label (embedded doc) type — filter by explore visibility.
    const isPrimitive = !!type && PRIMITIVE_FIELD_TYPES.has(type);
    if (!isPrimitive && !exploreSet.has(field)) {
      return false;
    }

    return isPathAnnotatableOnSlice(
      field,
      get(labelSchemaData(field))?.type,
      isPrimitive,
      sliceMediaType,
    );
  });
});

export const inactiveLabelSchemas = atom((get) => {
  // Doc mode: the contract is closed — no add-field surface.
  if (get(taskLabelSchemaDoc)) return [];
  const policy = get(taskSchemaPolicy);
  return Object.keys(get(labelSchemasData) ?? {})
    .sort()
    .filter(
      (field) =>
        !(get(activeLabelSchemas) ?? []).includes(field) &&
        // Policy-hidden fields can't be surfaced via "add field" either.
        policyFieldAccess(policy, field) !== "hidden",
    );
});

// =============================================================================
// Interfaces for annotation schema
// =============================================================================

// Custom order for active paths (null means use default sorted order)
export const activePathsOrder = datasetScopedAtom<string[] | null>(null);

// Active paths with drag-drop ordering support
export const activePaths = atom(
  (get) => {
    const customOrder = get(activePathsOrder);
    const paths: string[] = [];

    if (customOrder) {
      // Use custom order, but filter to only include paths that exist
      const existingPaths = new Set(paths);
      const orderedPaths = customOrder.filter((p) => existingPaths.has(p));
      // Add any new paths that aren't in the custom order
      const newPaths = paths.filter((p) => !customOrder.includes(p));
      return [...orderedPaths, ...newPaths.sort()];
    }

    return paths.sort();
  },
  (_, set, newOrder: string[]) => {
    set(activePathsOrder, newOrder);
  },
);

// =============================================================================
// Field type atoms
// =============================================================================

export const fieldType = atomFamily((path: string) =>
  atom((get) => {
    const legacyData = get(labelSchemaData(path));
    return legacyData?.type ? capitalize(legacyData.type) : undefined;
  }),
);

export const fieldAttributeCount = atomFamily((path: string) =>
  atom((get) => {
    const data = get(labelSchemaData(path));
    const attrs = data?.label_schema?.attributes;
    return Array.isArray(attrs) ? attrs.length : 0;
  }),
);

/**
 * Names of the attributes the annotation schema declares `dynamic` for a label
 * field path. A dynamic attribute may change within a track's presence
 * interval, so the video timeline gives it a value-segmented sub-track and the
 * sidebar forward-fills edits rather than fanning them across the track. Empty
 * when the schema is unloaded or the field has no dynamic attributes.
 *
 * Lives here (not in the video-annotation package) so it reads the same
 * `labelSchemaData` atom instance core writes — a cross-package atom import
 * would resolve to a different, never-written family.
 */
const dynamicAttributeNamesFromMeta = (
  meta: LabelSchemaMeta | null | undefined,
): string[] => {
  const attributes = meta?.label_schema?.attributes;
  if (!Array.isArray(attributes)) {
    return [];
  }

  return attributes
    .filter((attribute) => attribute.dynamic && attribute.name)
    .map((attribute) => attribute.name);
};

export const useDynamicAttributeNames = (path: string | null): string[] => {
  const meta = useAtomValue(labelSchemaData(path ?? ""));
  return useMemo(() => dynamicAttributeNamesFromMeta(meta), [meta]);
};

/**
 * A getter resolving dynamic attribute names for ANY field path, reading the
 * whole schema map once. Use this when several paths' attributes are needed in
 * one render (e.g. building per-field tracks) — calling the per-path hook in a
 * loop would break the rules of hooks, and a single primary-field lookup leaks
 * one field's dynamic attributes onto every other field's tracks.
 */
export const useDynamicAttributeNamesGetter = (): ((
  path: string | null,
) => string[]) => {
  const all = useAtomValue(labelSchemasData);
  return useCallback(
    (path: string | null) => dynamicAttributeNamesFromMeta(all?.[path ?? ""]),
    [all],
  );
};

export const fieldTypes = atom((get) => {
  return (get(activeLabelSchemas) ?? []).reduce(
    (acc, cur) => {
      acc[cur] = get(fieldType(cur));
      return acc;
    },
    {} as { [key: string]: string },
  );
});

export const addToActiveSchemas = atom(null, (get, set, add: Set<string>) => {
  const current: string[] = get(activeLabelSchemas) ?? [];
  set(activeLabelSchemas, [...current, ...add]);
});

export const removeFromActiveSchemas = atom(
  null,
  (get, set, remove: Set<string>) => {
    const current: string[] = get(activeLabelSchemas) ?? [];
    set(
      activeLabelSchemas,
      current.filter((field) => !remove.has(field)),
    );
  },
);

export const schemaManagerDisplayedAtom = atom(false);

/**
 * Check if a field is read-only.
 *
 * User-set schema `read_only` (from Schema Manager) takes precedence,
 * then falls back to field-level `read_only` (from Python backend).
 */
export const isFieldReadOnly = (data: LabelSchemaMeta | undefined): boolean => {
  return !!data?.label_schema?.read_only || !!data?.read_only;
};

/**
 * Public API for the current annotation schema context.
 */
export interface AnnotationSchemaContext {
  /**
   * Current loaded annotation schema.
   */
  labelSchema: Record<string, LabelSchemaMeta> | null;

  /**
   * Set the loaded annotation schema.
   *
   * @param schema Schema or null
   */
  setLabelSchema: (schema: Record<string, LabelSchemaMeta> | null) => void;

  /**
   * List of active schema paths.
   *
   * Each path in this list is available for annotation.
   */
  activeSchemaPaths: string[] | null;

  /**
   * Set the list of active schema paths.
   *
   * @param paths Active paths or null
   */
  setActiveSchemaPaths: (paths: string[] | null) => void;
}

/**
 * Hook which provides the current {@link AnnotationSchemaContext}.
 */
export const useAnnotationSchemaContext = (): AnnotationSchemaContext => {
  const [labelSchema, setLabelSchema] = useAtom<Record<
    string,
    LabelSchemaMeta
  > | null>(labelSchemasData);
  const [activeSchemaPaths, setActiveSchemaPaths] = useAtom(activeLabelSchemas);

  return useMemo(
    () => ({
      activeSchemaPaths,
      labelSchema,
      setActiveSchemaPaths,
      setLabelSchema,
    }),
    [activeSchemaPaths, labelSchema, setActiveSchemaPaths, setLabelSchema],
  );
};
