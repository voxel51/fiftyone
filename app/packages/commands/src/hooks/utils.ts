import { CommandContext, CommandContextManager } from "../context";

/**
 *
 * @param context A context id, a context, or nothing
 * @param inheritParent If this is a new context, whether to inherit the parent context
 * @returns If context is a CommandContext, it is returned with existing === true.
 * If it is a string and the context exists, it finds it and returns it with existing === true.
 * If it is a string and the context does not exists, it creates a new one.
 */
export function resolveContext(
  context: string | CommandContext | undefined
): CommandContext | undefined {
  if (context instanceof CommandContext) {
    return context;
  }
  if (!context) {
    return CommandContextManager.instance().getActiveContext();
  }
  if (typeof context === "string") {
    return CommandContextManager.instance().getCommandContext(context);
  }
}
