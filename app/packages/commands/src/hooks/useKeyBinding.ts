import { useEffect } from "react";
import { CommandContext, CommandContextManager } from "../context";
import { Command } from "../types";

/**
 * Registers a keybinding to a specific command in a context.
 * @param command The command or command id to bind to the key sequence
 * @param binding A key sequence specificed like: "ctrl+x", "s", "meta+x, ctrl+d".  @see KeyParser
 * @param context The context of the binding.  @see CommandContext
 */
export const useKeyBinding = (command: string | Command, binding: string, context?: CommandContext) => {
    let resolvedCmd: Command | undefined;
    let resolvedCtx: CommandContext;
    if (!context) {
        resolvedCtx = CommandContextManager.instance().getActiveContext();
    }
    else {
        resolvedCtx = context;
    }
    if (typeof command === "string") {
        resolvedCmd = resolvedCtx.getCommand(command);
    }
    else {
        resolvedCmd = command;
    }
    if (!resolvedCtx) {
        console.error(`Could not resolve a command context.`);
    }
    if (!resolvedCmd) {
        console.error(`Unable to find command ${command} while binding key ${binding}`);
    }
    useEffect(() => {
        if (resolvedCmd && resolvedCtx) {
            resolvedCtx.bindKey(binding, resolvedCmd.id);
            return () => {
                resolvedCtx.unbindKey(binding);
            }
        }
    }, [resolvedCtx, binding, resolvedCmd]);

}