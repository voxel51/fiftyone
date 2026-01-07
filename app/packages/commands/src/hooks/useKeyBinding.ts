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

    useEffect(() => {
        if (!resolvedCtx) {
            console.error(`Could not resolve a command context.`);
            return;
        }
        let cmd: Command | undefined;
        if (typeof command === "string") {
            cmd = resolvedCtx.getCommand(command);
        }
        else {
            cmd = command;
        }
        if (cmd) {
            resolvedCtx.bindKey(binding, cmd.id);
        }
        return () => {
            if (cmd) {
                resolvedCtx.unbindKey(binding);
            }
        }
    }, [resolvedCtx, command, binding]);

}