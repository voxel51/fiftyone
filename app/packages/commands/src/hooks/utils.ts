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
  context: string | CommandContext | undefined,
  inheritParent?: boolean
): { context: CommandContext; existed: boolean } {
  if (!context) {
    return {
      context: CommandContextManager.instance().getActiveContext(),
      existed: true,
    };
  }
  if (typeof context === "string") {
    const existing =
      CommandContextManager.instance().getCommandContext(context);
    if (existing) {
      return { context: existing, existed: true };
    }
    return {
      context: CommandContextManager.instance().createCommandContext(
        context,
        inheritParent ?? true
      ),
      existed: false,
    };
  }
  return { context, existed: true };
}
