import { useEffect, useMemo } from "react";
import { CommandContext, CommandContextManager } from "../context";
import { Command } from "../types";

/**
 * Registers a keybinding to a specific command in a context.
 * @param command The command or command id to bind to the key sequence
 * @param binding A key sequence specificed like: "ctrl+x", "s", "meta+x, ctrl+d".  @see KeyParser
 * @param context The context of the binding.  @see CommandContext
 */
export const useKeyBinding = (command: string | Command, binding: string, context?: CommandContext) => {
    const resolvedCtx = useMemo(() => {
        return context || CommandContextManager.instance().getActiveContext();
    }, [context]);
    const resolvedCmd = useMemo(() => {
        if (typeof command === "string") {
            return resolvedCtx?.getCommand(command);
        }
        return command;
    }, [command, resolvedCtx]);

    useEffect(() => {
        if (!resolvedCtx) {
            console.error(`Could not resolve a command context.`);
            return;
        }
        if (!resolvedCmd) {
            console.error(`Unable to find command ${command} while binding key ${binding}`);
            return;
        }
        resolvedCtx.bindKey(binding, resolvedCmd.id);
        return () => {
            resolvedCtx.unbindKey(binding);
        }
    }, [resolvedCtx, binding, resolvedCmd]);

}