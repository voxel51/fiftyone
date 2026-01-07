import { useCallback, useEffect, useMemo, useRef } from "react";
import { CommandContext, CommandContextManager } from "../context";

/**
 * Hook to create or bind to an existing context.  Used with useCommand, useKeyBinding to
 * contextualize execution.
 * If the context is created, it will be destroyed on unmount.
 * If the context already existed, it will not be destroyed, as someone else owns it's lifecycle.
 * A context contains the state of the command system for a particular workflow, 
 * including registered commands, keybindings and the undo/redo stack.
 * @param context The context or id of an existing context to use
 * @param inheritCurrent If the context is new, true to inherit the parent context
 * @returns The context, and an activate/deactive method to use it.
 */
export const useCommandContext = (context?: CommandContext | string, inheritCurrent?: boolean): {
    context: CommandContext,
    activate: () => void,
    deactivate: () => void
} => {
    const existed = useRef(false);
    const boundContext = useMemo(() => {
        if (typeof context === "string") {
            const existing = CommandContextManager.instance().getCommandContext(context);
            if (existing) {
                existed.current = true;
                return existing;
            }
            return CommandContextManager.instance().createCommandContext(context, inheritCurrent ? inheritCurrent : true);
        }
        if (context) {
            return context;
        }
        return CommandContextManager.instance().getActiveContext();
    }, [context, inheritCurrent]);

    useEffect(() => {
        return () => {
            if (!existed.current) {
                CommandContextManager.instance().destroyContext(boundContext.id);
            }
        }
    }, [boundContext]);

    const activate = useCallback(() => {
        CommandContextManager.instance().pushContext(boundContext);
    }, [boundContext]);

    const deactivate = useCallback(() => {
        CommandContextManager.instance().popContext();
    }, []);

    return { context: boundContext, activate, deactivate };
}