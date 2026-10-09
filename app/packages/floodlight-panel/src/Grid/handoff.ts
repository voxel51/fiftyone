import type { Scoped } from "../host/ownership";

/**
 * Moves every shared item from the previous instance to the next one in a
 * single synchronous step at the swap, so no tile on either side goes blank.
 * Items in `evict` that the next instance did not take are destroyed.
 */
export const handOff = ({
  cache,
  evict = [],
  next,
  previous,
}: {
  cache: {
    evict(key: string): void;
    freeze(): void;
    isShown(key: string): boolean;
    unfreeze(): void;
  };
  evict?: Iterable<string>;
  next?: Scoped<number, unknown>;
  previous?: Scoped<number, unknown>;
}) => {
  if (previous) {
    // retired first: the previous instance must not re-show what is moving
    previous.retire();
    cache.freeze();
    next?.flush();
    cache.unfreeze();
  } else {
    // a first instance shows its items itself; freezing would hide them all
    next?.flush();
  }
  for (const key of evict) !cache.isShown(key) && cache.evict(key);
};
