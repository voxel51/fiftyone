import { useCallback, useEffect, useRef, useState } from "react";
import { CommandContext } from "../context";
import { CommandFunction } from "../types";
import { resolveContext } from "./utils";
import { CommandHookReturn } from ".";

/**
 * Hook to define and register a command within a specific context.
 *
 * The command is automatically registered on mount and unregistered on unmount.
 *
 * @param context - The context in which to register the command.
 *   - Can be a `CommandContext` object or a string ID.
 *   - If the context cannot be resolved, the command is not registered.
 * @param id - Unique ID for the command.
 * @param execFn - The function to execute when the command is triggered.
 * @param enablement - Function returning a boolean to determine if the command is enabled.
 * @param label - (Optional) Display label for the command.
 * @param description - (Optional) Tooltip/help text for the command.
 *
 * @returns An object containing:
 * - `callback`: Function to explicitly execute the command.
 * - `descriptor`: Metadata (id, label, description).
 * - `enabled`: Current enabled state of the command.
 */
export const useCreateCommand = (
  context: CommandContext | string,
  id: string,
  execFn: CommandFunction,
  enablement: () => boolean,
  label?: string,
  description?: string
): CommandHookReturn => {
  const boundContext = resolveContext(context);

  const exec = useRef(execFn);
  const enable = useRef(enablement);
  const [enabled, setEnabled] = useState(enablement());

  useEffect(() => {
    exec.current = execFn;
    enable.current = enablement;
  }, [execFn, enablement]);

  useEffect(() => {
    if (!boundContext) return;
    const cmd = boundContext.registerCommand(
      id,
      () => exec.current(),
      () => enable.current(),
      label,
      description
    );

    setEnabled(cmd.isEnabled());
    const unsub = cmd.subscribe(() => setEnabled(cmd.isEnabled()));

    return () => {
      unsub();
      boundContext.unregisterCommand(cmd.id);
    };
  }, [boundContext, id, label, description]);

  useEffect(() => {
    if (!boundContext) return;
    const cmd = boundContext.getCommand(id);
    if (cmd) {
      setEnabled(cmd.isEnabled());
    }
  }, [enablement, id, boundContext]);

  return {
    callback: useCallback(async () => {
      return await boundContext?.executeCommand(id);
    }, [id, boundContext]),
    descriptor: {
      id: id,
      label: label ?? "",
      description: description ?? "",
    },
    enabled,
  };
};
