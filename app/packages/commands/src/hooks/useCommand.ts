import { useCallback, useMemo } from "react";
import { CommandContext, CommandContextManager } from "../context";
import { useCommandContext } from "./useCommandContext";
import { CommandHookReturn } from ".";

export type CommandDescriptor = {
  id: string;
  label: string;
  description: string;
};
/**
 * Gets a previously registered command @see useCreateCommand.
 * @param commandId A command id
 * @param context The context the command is bound to.  If not
 * provided the active context is checked.
 * @returns A callback to invoke the command and the command object.
 */
export const useCommand = (
  commandId: string,
  context?: string | CommandContext
): CommandHookReturn => {
  const boundContext = useCommandContext(context);
  const command = useMemo(() => {
    return boundContext.context.getCommand(commandId);
  }, [commandId, boundContext.context]);
  if (!command) {
    throw new Error(
      `useCommand: commandId ${commandId} could not be found in context ${boundContext.context.id}`
    );
  }
  const execute = useCallback(() => {
    CommandContextManager.instance().executeCommand(commandId);
  }, [commandId]);
  return {
    callback: execute,
    descriptor: {
      id: command.id,
      label: command.label ?? "",
      description: command.description ?? "",
    },
  };
};
