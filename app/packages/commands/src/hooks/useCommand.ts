import { useCallback, useEffect, useState } from "react";
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
  const [descriptor, setDescriptor] = useState<CommandDescriptor>(() => {
    const command = boundContext.context.getCommand(commandId);
    return {
      id: commandId,
      label: command?.label ?? "",
      description: command?.description ?? "",
    };
  });

  useEffect(() => {
    const update = () => {
      const command = boundContext.context.getCommand(commandId);
      setDescriptor({
        id: commandId,
        label: command?.label ?? "",
        description: command?.description ?? "",
      });
    };

    update();
    return boundContext.context.subscribeCommands(update);
  }, [commandId, boundContext.context]);

  const execute = useCallback(() => {
    CommandContextManager.instance().executeCommand(commandId);
  }, [commandId]);

  return {
    callback: execute,
    descriptor,
  };
};
