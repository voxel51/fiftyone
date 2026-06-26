/**
 * Modifier flags associated with a {@link PointerEvent}.
 */
export type ClickEventModifiers = {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

/**
 * Extract the {@link ClickEventModifiers} from a {@link PointerEvent}.
 *
 * @param event Event from which to extract click modifiers
 */
export const getClickModifiers = (
  event: PointerEvent,
): ClickEventModifiers => ({
  shiftKey: event.shiftKey,
  altKey: event.altKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
});
