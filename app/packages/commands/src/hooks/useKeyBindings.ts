import { useEffect, useRef } from "react";
import { Command, CommandFunction } from "../types";
import { resolveContext } from "./utils";

type CommandId = string;
type CommandDefinition = {
  commandId: CommandId;
  handler: CommandFunction;
  label: string;
  description?: string;
  enablement?: () => boolean;
};

type BindingCommand = CommandDefinition | CommandId;

export type KeyBinding = {
  sequence: string;
  command: BindingCommand;
};

/**
 * Hook to register global or context-specific key bindings.
 *
 * @param contextId - The ID of the command context to bind keys to.
 *   - The hook resolves this ID to a `CommandContext` instance.
 * @param keyBindings - An array of `KeyBinding` objects defining sequences and commands.
 *   - Commands can be referenced by string ID or defined inline.
 * @param deps - (Optional) Dependency array to trigger re-registration.
 */
export const useKeyBindings = (
  contextId: string,
  keyBindings: KeyBinding[],
  deps: unknown[] = []
) => {
  const context = resolveContext(contextId);
  const keyBindingsRef = useRef(keyBindings);

  useEffect(() => {
    keyBindingsRef.current = keyBindings;
  });

  useEffect(() => {
    if (!context) {
      return;
    }
    const registeredCommands: string[] = [];
    // ... rest of logic

    const registeredBindings: string[] = [];

    for (const binding of keyBindings) {
      let cmd: Command | undefined = undefined;
      if (typeof binding.command === "string") {
        cmd = context.getCommand(binding.command);
        if (!cmd) {
          throw new Error(`Command ${binding.command} not found`);
        }
      } else {
        cmd = context.registerCommand(
          binding.command.commandId,
          async () => {
            const latest = keyBindingsRef.current.find(
              (b) =>
                typeof b.command !== "string" &&
                b.command.commandId ===
                  (binding.command as CommandDefinition).commandId
            );
            if (latest && typeof latest.command !== "string") {
              return await latest.command.handler();
            }
          },
          () => {
            const latest = keyBindingsRef.current.find(
              (b) =>
                typeof b.command !== "string" &&
                b.command.commandId ===
                  (binding.command as CommandDefinition).commandId
            );
            return (
              (typeof latest?.command !== "string"
                ? latest?.command.enablement?.()
                : undefined) ?? true
            );
          },
          binding.command.label,
          binding.command.description
        );
        registeredCommands.push(cmd.id);
      }
      context.bindKey(binding.sequence, cmd.id);
      registeredBindings.push(binding.sequence);
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
