/** Runs `callback` once, `delay` ms after the last `trigger()` in a burst. */
export const createSettle = (callback: () => void, delay: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  return {
    cancel,
    trigger: () => {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        callback();
      }, delay);
    },
  };
};

export type Settle = ReturnType<typeof createSettle>;
