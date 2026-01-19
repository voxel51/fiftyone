import { useCallback, useEffect, useMemo, useRef } from "react";
import { CommandContext } from "../context";
import { CommandFunction } from "../types";
import { resolveContext } from "./utils";
import { CommandHookReturn } from ".";

/**
 * Hook to create and register a command in a given context.
 * The command is unregistered on unmount.
 * @param context An acquired context @see useCommandContext
 * @param id The id of the command
 * @param execFn The function to call when the command is executed
 * @param enablement A function to determine if the command is enabled
 * @param label The short name of the command, ie Edit, Save, etc
 * @param description A longer description fit for a tooltip
 * @returns A function to invoke the command
 */
export const useCreateCommand = (
  context: CommandContext | string,
  id: string,
  execFn: CommandFunction,
  enablement: () => boolean,
  label?: string,
  description?: string
): CommandHookReturn => {
  const boundContext = useMemo(() => {
    return resolveContext(context);
  }, [context]);

  const exec = useRef(execFn);
  const enable = useRef(enablement);

  useEffect(() => {
    exec.current = execFn;
    enable.current = enablement;
  }, [execFn, enablement]);

  useEffect(() => {
    const cmd = boundContext.context.registerCommand(
      id,
      () => exec.current(),
      () => enable.current(),
      label,
      description
    );
    return () => {
      boundContext.context.unregisterCommand(cmd.id);
    };
  }, [boundContext, id, exec, enable, label, description]);

  return {
    callback: useCallback(() => {
      return boundContext.context.executeCommand(id);
    }, [id, boundContext]),
    descriptor: {
      id: id,
      label: label ?? "",
      description: description ?? "",
    },
  };
};
