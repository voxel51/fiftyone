/**
 * Two retained selection layers sharing the chart's one emphasis
 * channel: the HOST layer (external selections — in FiftyOne terms,
 * grid checkboxes arriving through the `selected` prop) and the LASSO
 * layer (the chart's own gesture). One channel, last-writer-wins, was
 * the bug this replaces: checking then unchecking a grid sample
 * clobbered a live lasso's emphasis with no way back, while the grid
 * itself stayed scoped to the lasso — the plot alone forgot.
 *
 * The rule: the most recent non-null writer renders; clearing the
 * active layer falls back to the other (which is what makes uncheck
 * RESTORE the lasso); an explicit clear drops both. Plain precedence
 * fails in one direction or the other — "host wins" hides a new lasso
 * drawn while a checkbox is ticked, "lasso wins" hides the checkbox —
 * recency matches the user's intent in both.
 */
export class SelectionLayers {
  private host: ArrayLike<number> | null = null;
  private lasso: ArrayLike<number> | null = null;
  private active: "host" | "lasso" | null = null;

  /** External selection changed; returns what should render */
  writeHost(indices: ArrayLike<number> | null): ArrayLike<number> | null {
    this.host = indices;
    this.active = indices ? "host" : this.lasso ? "lasso" : null;
    return this.current();
  }

  /** The chart's lasso changed; returns what should render */
  writeLasso(indices: ArrayLike<number> | null): ArrayLike<number> | null {
    this.lasso = indices;
    this.active = indices ? "lasso" : this.host ? "host" : null;
    return this.current();
  }

  /** Drop both layers (Esc, clear affordances, new data) */
  clear(): null {
    this.host = null;
    this.lasso = null;
    this.active = null;
    return null;
  }

  current(): ArrayLike<number> | null {
    if (this.active === "host") return this.host;
    if (this.active === "lasso") return this.lasso;
    return null;
  }
}
