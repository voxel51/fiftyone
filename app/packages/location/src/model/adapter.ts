/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The host's whole contribution to reading and writing the URL.
 *
 * Every href here is root-relative — `/path` or `/path?query`, never an
 * absolute URL and never a fragment. Origin and any deployment prefix are the
 * adapter's business, so no route or param has to know where the app is
 * served from.
 *
 * Deliberately expressible with `location.pathname`, `location.search`,
 * `history.pushState`, `history.replaceState`, `history.back` and `popstate`
 * alone: a method
 * that needs `as`, `options`, `shallow`, a pop veto or a parsed query object
 * has let a router concept leak, and the interface is wrong rather than the
 * host.
 */
export interface Adapter {
  get(): string;
  /** New history entry. */
  push(href: string): void;
  /** Same history entry. */
  replace(href: string): void;
  /**
   * The previous history entry, as the browser's Back. It may land after it
   * returns; `subscribe` fires when it does.
   */
  back(): void;
  /**
   * Fires after every change, including the adapter's own writes: it is the
   * only signal React has that the location moved, and the only thing that
   * advances the store's generation.
   */
  subscribe(listener: () => void): () => void;
}
