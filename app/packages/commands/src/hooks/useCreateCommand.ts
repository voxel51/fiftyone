import { useCallback, useEffect, useRef, useState } from "react";
import { CommandContext } from "../context";
import { CommandFunction } from "../types";
import { resolveContext } from "./utils";
import { CommandHookReturn } from ".";

/**
 * Hook to create and register a command in a given context.
 * The command is unregistered on unmount.
 * @param context An acquired context @see CommandContext
 * @param id The id of the command
 * @param execFn The function to call when the command is executed
 * @param enablement A function to determine if the command is enabled
 * @param label The short name of the command, ie Edit, Save, etc
 * @param description A longer description fit for a tooltip
 * @returns A function to invoke the command, a descriptor object,
 * and a boolean indicating if the command is enabled
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
