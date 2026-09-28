/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The persist chain per annotation engine.
 *
 * Every persist PATCHes a sample under an `If-Match` version token, and the
 * server rejects a stale token with 412. Persistence has independent callers
 * — the autosave tick, a delete's immediate flush, the merge tool — each with
 * its own hook instance, so a hook-local guard cannot coordinate them. This
 * module-level map keys the chain by engine: two persists against the same
 * engine run one after the other, and each reads the engine only after the
 * previous one has settled and reconciled, so it never re-sends what already
 * landed and never sends the pre-write token.
 */
const chains = new WeakMap<object, Promise<unknown>>();

const noop = () => undefined;

/**
 * Run `task` after every persist previously enqueued for `engine` has
 * settled, including that persist's own failure handling. A rejected task
 * rejects its returned promise but never blocks the tasks queued behind it.
 */
export const enqueuePersist = <T>(
  engine: object,
  task: () => Promise<T>,
): Promise<T> => {
  const prior = chains.get(engine) ?? Promise.resolve();
  const run = prior.then(task, task);

  chains.set(engine, run.then(noop, noop));

  return run;
};
