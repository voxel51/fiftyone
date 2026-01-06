import { useEffect, useMemo, useRef } from "react";
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
 * @returns The new command
 */
export const useCommand = (context: CommandContext, id: string, execFn: CommandFunction, enablement: () => boolean, label?: string, description?: string) => {
    const exec = useRef(execFn);
    const enable = useRef(enablement);
    const cmd = useMemo(() => {
        return context.registerCommand(id, exec.current, enable.current, label, description);
    }, [id, label, description, context]);
    useEffect(() => {
        if (cmd) {
            return () => {
                context.unregisterCommand(id);
            }
        }
    }, [id, cmd, context]);
    return cmd;
}