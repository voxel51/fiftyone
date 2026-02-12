import { useEffect, useRef } from "react";
import { useCommandContext } from "./useCommandContext";
import { CommandFunction } from "../types";

export type KeyBinding = {
  commandId: string;
  sequence: string | string[];
  handler: CommandFunction;
  label: string;
  description?: string;
  enablement?: () => boolean;
};

/**
 * Registers a set of key bindings in a given context.
 * @param contextId The id of the context
 * @param keyBindings The key bindings to register
 * @param deps The optional dependency array for the hook
 */
export const useKeyBindings = (
  contextId: string,
  keyBindings: KeyBinding[],
  deps: unknown[] = []
) => {
  const { context } = useCommandContext(contextId);
  const keyBindingsRef = useRef(keyBindings);

  useEffect(() => {
    keyBindingsRef.current = keyBindings;
  });

  useEffect(() => {
    const registeredCommands: string[] = [];
    const registeredBindings: string[] = [];

    for (const binding of keyBindings) {
      const { commandId, sequence, label, description } = binding;
      const cmd = context.registerCommand(
        commandId,
        async () => {
          const latest = keyBindingsRef.current.find(
            (b) => b.commandId === commandId
          );
          return await latest?.handler();
        },
        () => {
          const latest = keyBindingsRef.current.find(
            (b) => b.commandId === commandId
          );
          return latest?.enablement?.() ?? true;
        },
        label,
        description
      );
      registeredCommands.push(cmd.id);

      if (Array.isArray(sequence)) {
        sequence.forEach((s) => {
          context.bindKey(s, cmd.id);
        });
        registeredBindings.push(...sequence);
      } else {
        context.bindKey(sequence, cmd.id);
        registeredBindings.push(sequence);
      }
    }

    return () => {
      for (const seq of registeredBindings) {
        context.unbindKey(seq);
      }
      for (const id of registeredCommands) {
        context.unregisterCommand(id);
      }
    };
  }, [context, ...deps]);
};
