/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * What a path means, defined by the host that serves it.
 *
 * The host owns both halves, so a path it does not model round-trips by
 * construction — writing a param can never move the user off a page this
 * package has never heard of.
 */
export interface RouteCodec<R> {
  parse(pathname: string): R;
  format(route: R): string;
  /**
   * An opaque token per scope the host defines, naming what that scope's
   * params currently belong to. A param clears when its scope's token
   * changes; the package compares tokens and interprets neither the names nor
   * the values.
   */
  scopes(route: R): Record<string, string>;
}

/**
 * One section's claim on the URL. Returning `undefined` means "not mine",
 * which is what lets a host adopt this package one route at a time while the
 * rest of its URLs stay with whatever router it has today.
 */
export interface RouteMatcher<R> {
  parse(pathname: string): R | undefined;
  format(route: R): string | undefined;
  scopes?(route: R): Record<string, string>;
}

/**
 * Builds a codec from section matchers, first claim winning, with `fallback`
 * covering everything still unmigrated. Adopting one more route is then adding
 * one matcher, not editing a parser.
 */
export const composeRoutes = <R>(
  matchers: RouteMatcher<R>[],
  fallback: RouteCodec<R>,
): RouteCodec<R> => ({
  parse(pathname) {
    for (const matcher of matchers) {
      const route = matcher.parse(pathname);
      if (route !== undefined) return route;
    }
    return fallback.parse(pathname);
  },

  format(route) {
    for (const matcher of matchers) {
      const path = matcher.format(route);
      if (path !== undefined) return path;
    }
    return fallback.format(route);
  },

  scopes(route) {
    for (const matcher of matchers) {
      if (matcher.format(route) === undefined) continue;
      return matcher.scopes?.(route) ?? {};
    }
    return fallback.scopes(route);
  },
});
