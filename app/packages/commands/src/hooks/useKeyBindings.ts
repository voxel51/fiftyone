import { useEffect, useRef } from "react";
import { useCommandContext } from "./useCommandContext";
import { CommandFunction } from "../types";

export type KeyBinding = {
  /** Unique command id registered in the target command context. */
  commandId: string;
  /** Key sequence, or sequences, that invoke the command. */
  sequence: string | string[];
  /** Function called when the binding is matched and enabled. */
  handler: CommandFunction;
  /** Short user-facing command label. */
  label: string;
  /** Optional longer user-facing command description. */
  description?: string;
  /** Optional predicate that controls whether the binding can run. */
  enablement?: () => boolean;
  /** Higher-priority duplicate bindings win before lower-priority ones. */
  priority?: number;
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
  deps: unknown[] = [],
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
      const { commandId, sequence, label, description, priority } = binding;
      const cmd = context.registerCommand(
        commandId,
        async () => {
          const latest = keyBindingsRef.current.find(
            (b) => b.commandId === commandId,
          );
          return await latest?.handler();
        },
        () => {
          const latest = keyBindingsRef.current.find(
            (b) => b.commandId === commandId,
          );
          return latest?.enablement?.() ?? true;
        },
        label,
        description,
      );
      registeredCommands.push(cmd.id);

      if (Array.isArray(sequence)) {
        sequence.forEach((s) => {
          context.bindKey(s, cmd.id, priority);
        });
        registeredBindings.push(...sequence);
      } else {
        context.bindKey(sequence, cmd.id, priority);
        registeredBindings.push(sequence);
      }
    }

    return () => {
      for (const id of registeredCommands) {
        for (const seq of registeredBindings) {
          context.unbindKey(seq, id);
        }
        context.unregisterCommand(id);
      }
    };
  }, [context, ...deps]);
};
