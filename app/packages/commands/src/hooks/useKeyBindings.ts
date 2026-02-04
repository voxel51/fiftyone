import { useEffect } from "react";
import { useCommandContext } from "./useCommandContext";
import { CommandFunction } from "../types";

export type KeyBinding = {
  commandId: string;
  sequence: string;
  handler: CommandFunction;
  label: string;
  description?: string;
  enablement?: () => boolean;
};

/**
 * Registers a set of key bindings in a given context.
 * @param contextId The id of the context
 * @param keyBindings The key bindings to register
 */
export const useKeyBindings = (
  contextId: string,
  keyBindings: KeyBinding[]
) => {
  const { context, activate, deactivate } = useCommandContext(contextId);
  useEffect(() => {
    activate();
    return () => {
      deactivate();
    };
  }, [activate, deactivate]);

  useEffect(() => {
    const registeredCommands: string[] = [];
    const registeredBindings: string[] = [];

    for (const keyBinding of keyBindings) {
      const cmd = context.registerCommand(
        keyBinding.commandId,
        keyBinding.handler,
        keyBinding.enablement ?? (() => true),
        keyBinding.label,
        keyBinding.description
      );
      registeredCommands.push(cmd.id);
      context.bindKey(keyBinding.sequence, cmd.id);
      registeredBindings.push(keyBinding.sequence);
    }

    return () => {
      for (const seq of registeredBindings) {
        context.unbindKey(seq);
      }
      for (const id of registeredCommands) {
        context.unregisterCommand(id);
      }
    };
  }, [context, keyBindings]);
};
