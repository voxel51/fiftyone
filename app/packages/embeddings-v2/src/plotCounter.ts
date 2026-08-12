/**
 * The plot's bottom-left counter.
 *
 * A selection is the thing the user just did, so while one exists the counter
 * leads with it. The run's size stays alongside as context — a selection means
 * little without knowing what it was drawn from — but it is never the only
 * number on show, which read as "nothing was selected".
 *
 * "In view" is a different quantity again: how many points survive the view
 * stages and sidebar filters. It is absent while nothing filters the run, and
 * absent under a selection too, because the plot deliberately does not re-filter
 * itself by the `Select` stage a selection publishes (that would hide the very
 * context the highlight is meant to sit in).
 */
export interface CounterParts {
  /** Points loaded so far; equals `total` once the run is fully loaded */
  loaded: number;
  /** Points in the whole run */
  total: number;
  /** Selected points/windows, or null when nothing is selected */
  selected: number | null;
  /** Points passing the view stages and filters, or null when none apply */
  inView: number | null;
}

export function counterLabel({
  loaded,
  total,
  selected,
  inView,
}: CounterParts): string {
  const noun = loaded === 1 ? "point" : "points";
  const size =
    loaded < total
      ? `${loaded.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} ${noun}`
      : `${loaded.toLocaleString("en-US")} ${noun}`;

  if (selected) {
    return `${selected.toLocaleString("en-US")} selected · ${size}`;
  }

  if (inView !== null) {
    return `${size} · ${inView.toLocaleString("en-US")} in view`;
  }

  return size;
}
