/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * A tiny consume-once relay for the undo key a freshly-drawn overlay committed
 * under. The engine Lighter bridge stashes the key by overlay id the moment it
 * commits a draw (`onEstablishCommit`); the video auto-extend takes it back —
 * also by overlay id — to fold its filler write into the draw's single undo
 * unit. Keyed by the globally-unique overlay id (not "the engine's last undo
 * entry"), so the handoff is explicit and order-independent: the take runs in a
 * microtask, after the bridge's synchronous commit has stashed the key.
 */
const keys = new Map<string, string>();

/** Stash the gesture key a draw committed under, keyed by its overlay id. */
export const stashEstablishKey = (overlayId: string, undoKey: string): void => {
  keys.set(overlayId, undoKey);
};

/** Take (and clear) a draw's stashed gesture key; `undefined` if none. */
export const takeEstablishKey = (overlayId: string): string | undefined => {
  const key = keys.get(overlayId);
  keys.delete(overlayId);
  return key;
};
