import { useCallback, useEffect, useRef } from "react";
import { CommandContext } from "../context";
import { CommandFunction } from "../types";

/**
 * Hook to create and register a command in a given context.
 * The command is unregistered on unmount.
 * @param context An acquired context @see useCommandContext
 * @param id The id of the command
 * @param execFn The. function to call when the command is executed
 * @param enablement A function to determine if the command is enabled
 * @param label The short name of the command, ie Edit, Save, etc
 * @param description A longer description fit for a tooltip
 * @returns A function to invoke the command
 */
export const useCommand = (
  context: CommandContext,
  id: string,
  execFn: CommandFunction,
  enablement: () => boolean,
  label?: string,
  description?: string
) => {
  const exec = useRef(execFn);
  const enable = useRef(enablement);
  useEffect(() => {
    exec.current = execFn;
    enable.current = enablement;
  }, [execFn, enablement]);

  useEffect(() => {
    const cmd = context.registerCommand(
      id,
      () => exec.current(),
      () => enable.current(),
      label,
      description
    );
    return () => {
      context.unregisterCommand(cmd.id);
    };
  }, [context, id, exec, enable, label, description]);

  return useCallback(async () => {
    return await context.executeCommand(id);
  }, [id, context]);
};
