import { CommandContext } from "../context";
import { CommandHookReturn } from ".";
import { resolveContext } from "./utils";
import { useCallback, useEffect, useState } from "react";

export type CommandDescriptor = {
  id: string;
  label: string;
  description: string;
};
/**
 * Hook to retrieve and observe a command's state from a specific or active context.
 *
 * @param commandId - The ID of the command to retrieve.
 * @param context - Optional context to search for the command in.
 *   - If a `CommandContext` object or ID is provided, it attempts to resolve that specific context.
 *   - If undefined, it resolves to the currently active context.
 * @returns An object containing:
 *   - `callback`: A function to execute the command.
 *   - `descriptor`: Metadata about the command (label, description).
 *   - `enabled`: Boolean indicating if the command is currently enabled.
 */

export const useCommand = (
  commandId: string,
  context?: string | CommandContext
): CommandHookReturn => {
  const boundContext = resolveContext(context);
  const [state, setState] = useState<{
    descriptor: CommandDescriptor;
    enabled: boolean;
  }>(() => {
    const command = boundContext?.getCommand(commandId);
    return {
      descriptor: {
        id: commandId,
        label: command?.label ?? "",
        description: command?.description ?? "",
      },
      enabled: command?.isEnabled() ?? false,
    };
  });

  useEffect(() => {
    if (!boundContext) return;
    let unsubCommand: (() => void) | undefined;
    const update = () => {
      const command = boundContext.getCommand(commandId);
      setState({
        descriptor: {
          id: commandId,
          label: command?.label ?? "",
          description: command?.description ?? "",
        },
        enabled: command?.isEnabled() ?? false,
      });

      if (unsubCommand) {
        unsubCommand();
        unsubCommand = undefined;
      }

      unsubCommand = command?.subscribe(update);
    };

    update();
    const unsubRegistry = boundContext.subscribeCommands(update);
    return () => {
      unsubRegistry();
      unsubCommand?.();
    };
  }, [commandId, boundContext]);

  const execute = useCallback(async () => {
    await boundContext?.executeCommand(commandId);
  }, [commandId, boundContext]);

  return {
    callback: execute,
    descriptor: state.descriptor,
    enabled: state.enabled,
  };
};
