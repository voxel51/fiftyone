import { KnownContexts, useUndoHistory, useUndoRedo } from "@fiftyone/commands";

/**
 * Undo/redo for the annotate toolbar, read from the ModalAnnotate command stack
 * (the single authority — see {@link useEngineUndoableBridge}). Returns the
 * actions, live enabled state, and the newest-first history views for the
 * button tooltips.
 */
export const useAnnotationUndoRedo = () => {
  const { undo, redo, undoEnabled, redoEnabled } = useUndoRedo(
    KnownContexts.ModalAnnotate
  );
  const { undoStack, redoStack } = useUndoHistory(KnownContexts.ModalAnnotate);

  return {
    undo,
    redo,
    undoEnabled,
    redoEnabled,
    undoStack,
    redoStack,
  };
};
