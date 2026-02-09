/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { KnownContexts, useCommandContext } from "@fiftyone/commands";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighterEventHandler,
  type Scene2D,
} from "@fiftyone/lighter";
import { type AnnotationLabel } from "@fiftyone/state";
import { getDefaultStore, useAtomValue } from "jotai";
import { isEqual } from "lodash";
import { useCallback, useEffect, useRef } from "react";
import { editing as editingAtom } from "../Sidebar/Annotate/Edit/state";
import { coerceStringBooleans } from "../Sidebar/Annotate/utils";

/**
 * Hook that synchronizes changes from Lighter overlays to the sidebar editing atoms.
 * It ensures that the sidebar remains the authoritative UI for editing, but
 * pulls data from the renderer when it changes (e.g. via commands, undo/redo).
 */
export function useSyncOverlayToSidebar(scene: Scene2D | null) {
  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  const store = getDefaultStore();
  const editingValue = useAtomValue(editingAtom);

  // Track the last synced label data to prevent unnecessary updates (and focus loss)
  const lastSyncedDataRef = useRef<AnnotationLabel["data"] | null>(null);

  // Reset the ref when the editing atom changes so we don't compare against stale data
  // from a previously selected label.
  useEffect(() => {
    lastSyncedDataRef.current = null;
  }, [editingValue]);

  const { context } = useCommandContext(KnownContexts.ModalAnnotate);

  const sync = useCallback(() => {
    // Only sync if we are actually editing a label atom
    if (!editingValue || typeof editingValue === "string") {
      return;
    }

    const currentEditing = store.get(editingValue);
    if (!currentEditing?.overlay) {
      return;
    }

    const overlayLabel = currentEditing.overlay.label;
    if (!overlayLabel) {
      return;
    }

    // Coerce data to match Sidebar expectations (e.g. string booleans)
    const coercedLabel = coerceStringBooleans(
      overlayLabel as Record<string, unknown>
    ) as AnnotationLabel["data"];

    if (isEqual(coercedLabel, lastSyncedDataRef.current)) {
      return;
    }

    // Update the atom with the latest authoritative data from the overlay
    // We perform a full replacement to ensure fields are cleared correctly on undo
    store.set(editingValue, {
      ...currentEditing,
      data: coercedLabel,
    } as AnnotationLabel);

    lastSyncedDataRef.current = coercedLabel;
  }, [editingValue, store]);

  const handleEvent = useCallback(() => {
    sync();
  }, [sync]);

  // Comprehensive action subscription (catches global undo/redo/execute)
  useEffect(() => {
    return context.subscribeActions(() => sync());
  }, [context, sync]);

  // Lighter-specific event fallbacks (e.g. for commands not handled by global context)
  useEventHandler("lighter:command-executed", handleEvent);

  // Sync when the editing atom changes (e.g. new label selected or mount)
  useEffect(() => {
    sync();
  }, [sync]);
}
