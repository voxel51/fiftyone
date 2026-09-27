/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The pure model behind a matrix cell's depth stack: which loaded item is
 * in front, which pages are loaded, and when to ask for the next one.
 */

/** Items drawn at once: the front item plus the layers behind it. */
export const STACK_DEPTH = 5;

/** Load the next page once this few loaded items remain past the front. */
export const PREFETCH_AHEAD = 8;

export interface StackItem {
  id: { description: string };
}

export interface StackEntry<T extends StackItem> {
  item: T;
  /** The page key the item was loaded from. */
  page: number;
}

export interface StackState<T extends StackItem> {
  entries: StackEntry<T>[];
  /** Index of the front item in `entries`. */
  position: number;
  /** The next page to load, or `null` once the last page is loaded. */
  next: number | null;
  loading: boolean;
}

export const emptyStack = <T extends StackItem>(): StackState<T> => ({
  entries: [],
  position: 0,
  next: 0,
  loading: false,
});

export const clampPosition = (position: number, loaded: number) =>
  loaded ? Math.min(Math.max(Math.trunc(position), 0), loaded - 1) : 0;

const withPosition = <T extends StackItem>(
  state: StackState<T>,
  position: number,
) => {
  const next = clampPosition(position, state.entries.length);
  return next === state.position ? state : { ...state, position: next };
};

/** Moves the front `delta` items deeper (positive) or back toward the start. */
export const stepStack = <T extends StackItem>(
  state: StackState<T>,
  delta: number,
) => withPosition(state, state.position + delta);

/** Brings the item with `description` to the front, if it is loaded. */
export const seekStack = <T extends StackItem>(
  state: StackState<T>,
  description: string,
) => {
  const index = state.entries.findIndex(
    (entry) => entry.item.id.description === description,
  );
  return index < 0 ? state : withPosition(state, index);
};

/** The page to request now, or `null` when none is due. */
export const pageToLoad = <T extends StackItem>(
  state: StackState<T>,
  ahead = PREFETCH_AHEAD,
) =>
  !state.loading &&
  state.next !== null &&
  state.entries.length - 1 - state.position < ahead
    ? state.next
    : null;

export const beginPage = <T extends StackItem>(state: StackState<T>) =>
  state.loading ? state : { ...state, loading: true };

/** Appends page `page` if it is the one the stack is waiting for. */
export const receivePage = <T extends StackItem>(
  state: StackState<T>,
  page: number,
  items: T[],
  next: number | null,
): StackState<T> => {
  if (page !== state.next) return state;
  return {
    ...state,
    entries: [...state.entries, ...items.map((item) => ({ item, page }))],
    loading: false,
    next,
  };
};

/** A failed page ends paging rather than retrying in a loop. */
export const failPage = <T extends StackItem>(
  state: StackState<T>,
): StackState<T> => ({ ...state, loading: false, next: null });

/** The front item and the layers behind it, front first. */
export const visibleLayers = <T extends StackItem>(
  state: StackState<T>,
  depth = STACK_DEPTH,
) => state.entries.slice(state.position, state.position + depth);

/** The item count once every page is loaded, else `null`. */
export const stackTotal = <T extends StackItem>(state: StackState<T>) =>
  state.next === null ? state.entries.length : null;

/** "3 / 24", or "3 / 20+" while more pages remain. */
export const positionLabel = <T extends StackItem>(state: StackState<T>) => {
  const total = stackTotal(state);
  const front = state.entries.length ? state.position + 1 : 0;
  return `${front} / ${total ?? `${state.entries.length}+`}`;
};
