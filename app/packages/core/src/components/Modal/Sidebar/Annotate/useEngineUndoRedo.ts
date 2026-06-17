import { useAnnotationEngine, useEngineSelector } from "@fiftyone/annotation";
import { KnownContexts, useKeyBindings } from "@fiftyone/commands";
import { useCallback } from "react";

/**
 * Engine-backed undo/redo for the annotate modal — the engine's value-based
 * undo stack is the single source of truth (D7). Returns the actions plus live
 * enabled state for the toolbar buttons; the keybindings are registered by
 * {@link useRegisterEngineUndoRedo}. `canUndo`/`canRedo` re-read on every engine
 * tick, so the buttons reflect the real stack.
 */
export const useEngineUndoRedo = () => {
  const engine = useAnnotationEngine();

  const undo = useCallback(() => engine.undo(), [engine]);
  const redo = useCallback(() => engine.redo(), [engine]);
  const undoEnabled = useEngineSelector(engine, (e) => e.canUndo());
  const redoEnabled = useEngineSelector(engine, (e) => e.canRedo());
  // terse newest-first stack views for the history tooltips
  const history = useEngineSelector(engine, (e) => e.historyView());

  return {
    undo,
    redo,
    undoEnabled,
    redoEnabled,
    undoStack: history.undo,
    redoStack: history.redo,
  };
};

/**
 * Binds undo/redo keys on the ModalAnnotate context to the engine, shadowing
 * the default command-context bindings (the keydown walk hits this context
 * first). Always-enabled, so the engine is unconditionally authoritative in
 * annotate mode — an empty stack just no-ops rather than falling through to the
 * legacy command-context undo. Mount once, in Annotate.
 */
export const useRegisterEngineUndoRedo = () => {
  const engine = useAnnotationEngine();

  useKeyBindings(
    KnownContexts.ModalAnnotate,
    [
      {
        commandId: "fo.annotate.engineUndo",
        sequence: ["ctrl+z", "meta+z"],
        handler: () => engine.undo(),
        label: "Undo",
        description: "Undo the previous annotation edit.",
      },
      {
        commandId: "fo.annotate.engineRedo",
        sequence: ["ctrl+shift+z", "meta+y", "meta+shift+z"],
        handler: () => engine.redo(),
        label: "Redo",
        description: "Redo the previously undone annotation edit.",
      },
    ],
    [engine]
  );
};
