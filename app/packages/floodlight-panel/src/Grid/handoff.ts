import type { Scoped } from "../host/ownership";

/**
 * Moves every shared looker from the previous instance to the next one in a
 * single synchronous step at the swap, so no tile on either side goes blank.
 */
export const handOff = ({
  cache,
  next,
  previous,
}: {
  cache: { freeze(): void; unfreeze(): void };
  next?: Scoped<number, unknown>;
  previous?: Scoped<number, unknown>;
}) => {
  // retired first: the previous instance must not re-show what is moving
  previous?.retire();
  cache.freeze();
  next?.flush();
  cache.unfreeze();
};
