/**
 * Redux slice for annotation UI state — hackday experiment.
 *
 * This is the Redux source of truth for annotation state. Derived selectors
 * replace Jotai derived atoms. The JotaiToReduxBridge syncs raw Jotai state
 * into this slice; components read exclusively from Redux.
 */
import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  CLASSIFICATION,
  CLASSIFICATIONS,
  DETECTION,
  DETECTIONS,
  POLYLINE,
  POLYLINES,
} from "@fiftyone/utilities";
import { capitalize } from "lodash";
import { PRIMITIVE_FIELD_TYPES } from "../SchemaManager/constants";
import type { LabelSchemaMeta } from "../useSchemaManager";

// ── Types ──────────────────────────────────────────────────────────────

export interface AnnotationLabel {
  id: string;
  overlayId: string;
  path: string;
  type: string;
  cls: string;
  isNew?: boolean;
  label?: string;
  confidence?: number;
  boundingBox?: number[];
  /** Full label data blob (serializable subset) */
  data?: Record<string, unknown>;
}

interface AnnotationUiState {
  /** Whether annotation mode is active */
  isAnnotating: boolean;

  /** The label currently being edited, or null */
  editingLabel: AnnotationLabel | null;

  /** Whether we're creating a new label vs editing existing */
  isNewLabel: boolean;

  /** All labels on the current sample */
  labels: AnnotationLabel[];

  /** Active schema field paths */
  activeSchemas: string[];

  /** Currently hovered label ID */
  hoveredLabelId: string | null;

  /** The active schema tab */
  schemaTab: "gui" | "json";

  /** Full schema data keyed by field path (from useSchemaManager) */
  labelSchemasData: Record<string, LabelSchemaMeta> | null;

  /** Explore sidebar active fields (bridged from Recoil) */
  exploreActiveFields: string[] | null;
}

const initialState: AnnotationUiState = {
  isAnnotating: false,
  editingLabel: null,
  isNewLabel: false,
  labels: [],
  activeSchemas: [],
  hoveredLabelId: null,
  schemaTab: "gui",
  labelSchemasData: null,
  exploreActiveFields: null,
};

// ── Slice ──────────────────────────────────────────────────────────────

export const annotationSlice = createSlice({
  name: "annotation",
  initialState,
  reducers: {
    setAnnotating(state, action: PayloadAction<boolean>) {
      state.isAnnotating = action.payload;
    },
    setEditingLabel(state, action: PayloadAction<AnnotationLabel | null>) {
      state.editingLabel = action.payload;
    },
    setIsNewLabel(state, action: PayloadAction<boolean>) {
      state.isNewLabel = action.payload;
    },
    setLabels(state, action: PayloadAction<AnnotationLabel[]>) {
      state.labels = action.payload;
    },
    setActiveSchemas(state, action: PayloadAction<string[]>) {
      state.activeSchemas = action.payload;
    },
    hoverLabel(state, action: PayloadAction<string | null>) {
      state.hoveredLabelId = action.payload;
    },
    setSchemaTab(state, action: PayloadAction<"gui" | "json">) {
      state.schemaTab = action.payload;
    },
    setLabelSchemasData(
      state,
      action: PayloadAction<Record<string, LabelSchemaMeta> | null>
    ) {
      state.labelSchemasData = action.payload;
    },
    setExploreActiveFields(state, action: PayloadAction<string[] | null>) {
      state.exploreActiveFields = action.payload;
    },
    /** Update the data on the label currently being edited. */
    updateEditingLabelData(
      state,
      action: PayloadAction<Record<string, unknown>>
    ) {
      if (state.editingLabel) {
        state.editingLabel.data = {
          ...state.editingLabel.data,
          ...action.payload,
        };
      }
    },
    /** Update a label in the labels array by ID. */
    updateLabelById(
      state,
      action: PayloadAction<{ id: string; changes: Partial<AnnotationLabel> }>
    ) {
      const idx = state.labels.findIndex(
        (l) => l.id === action.payload.id
      );
      if (idx !== -1) {
        state.labels[idx] = { ...state.labels[idx], ...action.payload.changes };
      }
    },
    /** Add a label to the list (deduped by overlayId). */
    addLabel(state, action: PayloadAction<AnnotationLabel>) {
      const exists = state.labels.some(
        (l) => l.overlayId === action.payload.overlayId
      );
      if (!exists) {
        state.labels.push(action.payload);
      }
    },
    /** Remove a label by overlayId. */
    removeLabelByOverlayId(state, action: PayloadAction<string>) {
      state.labels = state.labels.filter(
        (l) => l.overlayId !== action.payload
      );
    },
    /** Start editing a label by its overlayId. */
    startEditing(state, action: PayloadAction<string>) {
      const label = state.labels.find(
        (l) => l.overlayId === action.payload
      );
      if (label) {
        state.editingLabel = label;
        state.isAnnotating = true;
        state.isNewLabel = false;
      }
    },
    /** Start editing with a new label type (no existing label yet). */
    startEditingNewType(state, action: PayloadAction<string>) {
      state.editingLabel = {
        id: "new",
        overlayId: "",
        path: "",
        type: action.payload,
        cls: action.payload,
        isNew: true,
      };
      state.isAnnotating = true;
      state.isNewLabel = true;
    },
    /** Clear editing state. */
    clearEditing(state) {
      state.editingLabel = null;
      state.isAnnotating = false;
      state.isNewLabel = false;
    },
  },
});

export const {
  setAnnotating,
  setEditingLabel,
  setIsNewLabel,
  setLabels,
  setActiveSchemas,
  hoverLabel,
  setSchemaTab,
  setLabelSchemasData,
  setExploreActiveFields,
  updateEditingLabelData,
  updateLabelById,
  addLabel,
  removeLabelByOverlayId,
  startEditing,
  startEditingNewType,
  clearEditing,
} = annotationSlice.actions;

// ── Selectors (replace Jotai derived atoms) ────────────────────────────

const selectLabels = (state: { annotation: AnnotationUiState }) =>
  state.annotation.labels;

const selectActiveSchemas = (state: { annotation: AnnotationUiState }) =>
  state.annotation.activeSchemas;

const selectLabelSchemasData = (state: { annotation: AnnotationUiState }) =>
  state.annotation.labelSchemasData;

const selectExploreActiveFields = (state: { annotation: AnnotationUiState }) =>
  state.annotation.exploreActiveFields;

/** Labels grouped by field path. */
export const selectLabelsByPath = createSelector(
  [selectLabels],
  (labels) => {
    const byPath: Record<string, AnnotationLabel[]> = {};
    for (const label of labels) {
      if (!byPath[label.path]) byPath[label.path] = [];
      byPath[label.path].push(label);
    }
    return byPath;
  }
);

/** Look up a single label by overlayId. */
export const selectLabelByOverlayId = (overlayId: string) =>
  createSelector([selectLabels], (labels) =>
    labels.find((l) => l.overlayId === overlayId) ?? null
  );

const selectEditingLabel = (state: { annotation: AnnotationUiState }) =>
  state.annotation.editingLabel;

const selectIsNewLabel = (state: { annotation: AnnotationUiState }) =>
  state.annotation.isNewLabel;

/**
 * fieldType(path) — capitalize(schema.type) for a given field.
 * Replaces: `atomFamily((path) => atom((get) => capitalize(get(labelSchemaData(path))?.type)))`
 */
export const selectFieldType = (path: string) =>
  createSelector([selectLabelSchemasData], (schemas) => {
    const data = schemas?.[path];
    return data?.type ? capitalize(data.type) : undefined;
  });

/**
 * fieldTypes — map of all active schemas to their capitalized types.
 * Replaces: `atom((get) => activeLabelSchemas.reduce(...))`
 */
export const selectFieldTypes = createSelector(
  [selectActiveSchemas, selectLabelSchemasData],
  (active, schemas) =>
    active.reduce(
      (acc, field) => {
        const data = schemas?.[field];
        acc[field] = data?.type ? capitalize(data.type) : "";
        return acc;
      },
      {} as Record<string, string>
    )
);

/**
 * visibleLabelSchemas — intersection of activeSchemas and exploreActiveFields,
 * with primitive fields always visible.
 * Replaces: `atom((get) => activeLabelSchemas.filter(...))`
 */
export const selectVisibleLabelSchemas = createSelector(
  [selectActiveSchemas, selectExploreActiveFields, selectLabelSchemasData],
  (active, explore, schemas) => {
    if (!active.length) return [];

    const exploreSet = new Set(explore ?? []);
    return active.filter((field) => {
      const data = schemas?.[field];
      const type = data?.type ? capitalize(data.type) : undefined;
      if (type && PRIMITIVE_FIELD_TYPES.has(type)) {
        return true;
      }
      return exploreSet.has(field);
    });
  }
);

/**
 * inactiveLabelSchemas — schema fields that are NOT in activeSchemas.
 * Replaces: `atom((get) => Object.keys(labelSchemasData).filter(...))`
 */
export const selectInactiveLabelSchemas = createSelector(
  [selectLabelSchemasData, selectActiveSchemas],
  (schemas, active) => {
    const activeSet = new Set(active);
    return Object.keys(schemas ?? {})
      .sort()
      .filter((field) => !activeSet.has(field));
  }
);

/**
 * fieldAttributeCount(path) — number of attributes in a field's schema.
 * Replaces: `atomFamily((path) => atom(...))`
 */
export const selectFieldAttributeCount = (path: string) =>
  createSelector([selectLabelSchemasData], (schemas) => {
    const attrs = schemas?.[path]?.label_schema?.attributes;
    return Array.isArray(attrs) ? attrs.length : 0;
  });

/**
 * currentData — the data blob of the label being edited.
 * Replaces: `atom((get) => get(current)?.data ?? null)`
 */
export const selectCurrentData = createSelector(
  [selectEditingLabel],
  (label) => label?.data ?? null
);

/**
 * currentOverlayId — the overlay ID of the label being edited.
 * Components use `useOverlayById(id)` to resolve the live object.
 */
export const selectCurrentOverlayId = createSelector(
  [selectEditingLabel],
  (label) => label?.overlayId ?? null
);

// ── Label type sets (mirrored from Edit/state.ts) ──────────────────────

export type LabelType =
  | typeof CLASSIFICATION
  | typeof DETECTION
  | typeof POLYLINE;

const IS_CLASSIFICATION_SET = new Set([CLASSIFICATION, CLASSIFICATIONS]);
const IS_DETECTION_SET = new Set([DETECTION, DETECTIONS]);
const IS_POLYLINE_SET = new Set([POLYLINE, POLYLINES]);
const IS: Record<string, Set<string>> = {
  [CLASSIFICATION]: IS_CLASSIFICATION_SET,
  [DETECTION]: IS_DETECTION_SET,
  [POLYLINE]: IS_POLYLINE_SET,
};

/**
 * fieldsOfType(type) — writable fields matching a label type.
 * Replaces: `atomFamily((type) => atom((get) => visibleLabelSchemas.filter(...)))`
 */
export const selectFieldsOfType = (type: LabelType) =>
  createSelector(
    [selectVisibleLabelSchemas, selectLabelSchemasData],
    (visible, schemas) => {
      const typeSet = IS[type];
      if (!typeSet || !schemas) return [];

      return visible
        .filter((field) => {
          const data = schemas[field];
          const fieldTypeCap = data?.type ? capitalize(data.type) : undefined;
          if (!fieldTypeCap || !typeSet.has(fieldTypeCap)) return false;
          // Exclude read-only fields
          return !data?.label_schema?.read_only && !data?.read_only;
        })
        .sort();
    }
  );

// ── Edit panel selectors ───────────────────────────────────────────────

/**
 * currentType — the LabelType of whatever is being edited.
 * Replaces: `atom((get) => { ... IS[kind].has(type) ... })`
 */
export const selectCurrentType = createSelector(
  [selectEditingLabel],
  (label): LabelType | null => {
    if (!label) return null;

    const type = label.type || label.cls;
    for (const [kind, values] of Object.entries(IS)) {
      if (values.has(type)) {
        return kind as LabelType;
      }
    }
    // If the type IS a label type string directly (from startEditingType)
    if (type in IS) return type as LabelType;

    return null;
  }
);

/**
 * currentField — the field path of the label being edited.
 * Replaces: `atom((get) => get(current)?.path)`
 */
export const selectCurrentField = createSelector(
  [selectEditingLabel],
  (label) => label?.path ?? null
);

/**
 * currentFieldIsReadOnly — whether the current field's schema is read-only.
 * Replaces: `atom((get) => isFieldReadOnly(get(labelSchemaData(field))))`
 */
export const selectCurrentFieldIsReadOnly = createSelector(
  [selectEditingLabel, selectLabelSchemasData],
  (label, schemas) => {
    if (!label?.path || !schemas) return false;
    const data = schemas[label.path];
    return !!(data?.label_schema?.read_only || data?.read_only);
  }
);

/**
 * currentFields — writable fields for the current label type.
 * Replaces: `atom((get) => get(fieldsOfType(get(currentType))))`
 */
export const selectCurrentFields = createSelector(
  [selectCurrentType, selectVisibleLabelSchemas, selectLabelSchemasData],
  (type, visible, schemas) => {
    if (!type || !schemas) return [];
    const typeSet = IS[type];
    if (!typeSet) return [];

    return visible
      .filter((field) => {
        const data = schemas[field];
        const fieldTypeCap = data?.type ? capitalize(data.type) : undefined;
        if (!fieldTypeCap || !typeSet.has(fieldTypeCap)) return false;
        return !data?.label_schema?.read_only && !data?.read_only;
      })
      .sort();
  }
);
