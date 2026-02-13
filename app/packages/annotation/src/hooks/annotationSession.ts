/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getDefaultStore } from "jotai";
import {
  editing,
  savedLabel,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { _dangerousQuickDrawActiveAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useQuickDraw";

const STORE = getDefaultStore();

/**
 * Overlay IDs created during annotation (via the establish event).
 * Used to distinguish freshly-drawn Quick Draw labels from pre-existing
 * sample labels when selecting the previous overlay after undo.
 */
const sessionOverlayIds = new Set<string>();

export const trackOverlay = (id: string): void => {
  sessionOverlayIds.add(id);
};

export const untrackOverlay = (id: string): void => {
  sessionOverlayIds.delete(id);
};

export const getSessionOverlayIds = (): ReadonlySet<string> => {
  return sessionOverlayIds;
};

/**
 * Clears the Quick Draw flag and session overlay ID set.
 * Does not touch editing or savedLabel state.
 */
export const clearSessionTracking = (): void => {
  STORE.set(_dangerousQuickDrawActiveAtom, false);
  sessionOverlayIds.clear();
};

/**
 * Resets all drawing-session state: clears editing, savedLabel, quickDraw
 * flag, and the session overlay set.
 */
export const resetDrawingSession = (): void => {
  STORE.set(editing, null);
  STORE.set(savedLabel, null);
  clearSessionTracking();
};
