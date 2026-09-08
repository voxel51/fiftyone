import { useAnnotationEngine } from "@fiftyone/annotation";
import { KnownContexts, useCommandContext } from "@fiftyone/commands";
import { useEffect } from "react";
import type { EngineUndoableBinding } from "./engineUndoableBridge";
import { bindEngineCommits, bindEngineDrops } from "./engineUndoableBridge";

const usePushEngineUndoables = (binding: EngineUndoableBinding) => {
  const { engine, context } = binding;

  useEffect(() => bindEngineCommits({ engine, context }), [engine, context]);
};

const usePruneDroppedUndoables = (binding: EngineUndoableBinding) => {
  const { engine, context } = binding;

  useEffect(() => bindEngineDrops({ engine, context }), [engine, context]);
};

/**
 * Binds the engine's value-based undo ledger into the global command stack: the
 * stack is the single undo/redo authority (so non-engine annotate actions
 * interleave correctly), and the engine produces + applies entries by id. Mount
 * once, in Annotate.
 */
export const useEngineUndoableBridge = () => {
  const engine = useAnnotationEngine();
  const { context } = useCommandContext(KnownContexts.ModalAnnotate);

  usePushEngineUndoables({ engine, context });
  usePruneDroppedUndoables({ engine, context });
};
