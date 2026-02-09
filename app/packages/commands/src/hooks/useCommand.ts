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
 * Gets a previously registered command @see useCreateCommand.
 * @param commandId A command id
 * @param context The context the command is bound to.  If not
 * provided the active context is checked.
 * @returns A callback to invoke the command and the command object,
 * a descriptor object, and a boolean indicating if the command is enabled.
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
