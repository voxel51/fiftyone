import { useEffect } from "react";
import { useCommandContext } from "./useCommandContext";
import { useCommand } from "./useCommand";
import { useKeyBinding } from "./useKeyBinding";

export type KeyBinding = {
    commandId: string;
    sequence: string;
    handler: () => Promise<void> | void;
    label: string;
    description?: string;
    enablement?: () => boolean;
}

export const useKeyBindings = (contextId: string,
    keyBindings: KeyBinding[]) => {
    const { context, activate, deactivate } = useCommandContext(contextId);
    useEffect(() => {
        activate();
        return () => {
            deactivate();
        }
    }, [activate, deactivate]);

    for (const keyBinding of keyBindings) {
        useCommand(context,
            keyBinding.commandId,
            keyBinding.handler,
            keyBinding.enablement || (() => { return true; }),
            keyBinding.label,
            keyBinding.description);
        useKeyBinding(keyBinding.commandId,
            keyBinding.sequence,
            context);
    }
}