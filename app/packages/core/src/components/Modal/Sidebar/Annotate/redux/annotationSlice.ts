/**
 * Redux slice for annotation UI state — hackday experiment.
 *
 * Mirrors key pieces of the Jotai annotation state into Redux so they're
 * visible in Redux DevTools. The Jotai atoms remain the source of truth;
 * this slice is synced from them via the ReduxExperiment bridge.
 */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

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
}

const initialState: AnnotationUiState = {
  isAnnotating: false,
  editingLabel: null,
  isNewLabel: false,
  labels: [],
  activeSchemas: [],
  hoveredLabelId: null,
  schemaTab: "gui",
};

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
} = annotationSlice.actions;
