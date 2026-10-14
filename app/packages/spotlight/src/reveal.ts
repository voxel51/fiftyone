/** Reveal a row with at most one viewport of animated travel. */
export async function revealRow(
  element: HTMLElement,
  top: number,
  height: number,
  signal: AbortSignal,
  render: () => void,
) {
  signal.throwIfAborted();
  const start = element.scrollTop;
  const viewport = element.clientHeight;
  const bottom = top + height;
  const visible =
    (top >= start && bottom <= start + viewport) ||
    (top <= start && bottom >= start + viewport);
  const destination = visible
    ? start
    : Math.max(
        0,
        Math.min(
          top < start ? top : bottom - viewport,
          element.scrollHeight - viewport,
        ),
      );
  const distance = destination - start;
  const animate =
    distance !== 0 &&
    Math.abs(distance) <= viewport &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  await new Promise<void>((resolve, reject) => {
    let frame: number;
    let started: number | undefined;
    const abort = () => {
      cancelAnimationFrame(frame);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    const step = (now: number) => {
      started ??= now;
      const progress = animate ? Math.min((now - started) / 180, 1) : 1;
      if (distance !== 0)
        element.scrollTo({
          top: start + distance * (1 - (1 - progress) ** 3),
          behavior: "auto",
        });
      render();
      if (progress < 1) frame = requestAnimationFrame(step);
      else {
        signal.removeEventListener("abort", abort);
        resolve();
      }
    };
    frame = requestAnimationFrame(step);
  });
}
