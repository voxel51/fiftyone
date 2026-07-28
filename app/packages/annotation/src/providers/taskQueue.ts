/**
 * Create a FIFO async task queue. The returned `enqueue` runs tasks strictly
 * one at a time in submission order; a task's failure rejects its own caller
 * but never blocks later tasks.
 */
export const createTaskQueue = () => {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
};
