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
  path: string;
  type: string;
  cls: string;
  label?: string;
  confidence?: number;
  boundingBox?: number[];
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
} = annotationSlice.actions;

// ── Selectors (replace Jotai derived atoms) ────────────────────────────

/** Raw slice selector */
const selectAnnotation = (state: { annotation: AnnotationUiState }) =>
  state.annotation;

const selectActiveSchemas = (state: { annotation: AnnotationUiState }) =>
  state.annotation.activeSchemas;

const selectLabelSchemasData = (state: { annotation: AnnotationUiState }) =>
  state.annotation.labelSchemasData;

const selectExploreActiveFields = (state: { annotation: AnnotationUiState }) =>
  state.annotation.exploreActiveFields;

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
