/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Adapter } from "@fiftyone/location";
import type { History } from "history";
import { LOCATION_WRITE } from "../routing/RouterContext";

/**
 * `?proxy=` is a deployment path prefix, not part of the location: today
 * `matchPath` strips it before matching and `resolveURL` adds it back. It
 * stays here so no route or param has to know the app is served under a
 * prefix.
 */
const prefix = (search: string) =>
  decodeURIComponent(new URLSearchParams(search).get("proxy") ?? "");

const strip = (pathname: string, proxy: string) =>
  proxy && pathname.startsWith(proxy)
    ? `/${pathname.slice(proxy.length)}`.replace("//", "/")
    : pathname;

const restore = (href: string, proxy: string) => {
  if (!proxy) return href;
  const [path, query] = href.split("?");
  const prefixed = `${proxy}${path === "/" ? "" : path}` || "/";
  return query ? `${prefixed}?${query}` : prefixed;
};

/**
 * Wraps the history instance the app already navigates with, rather than
 * `window.history`. Two reasons, both load-bearing: a notebook runs on a
 * memory history where `window.location` is not the location at all, and a
 * write that does not go through this instance would not notify us.
 */
// the entry keeps the state it had, marked as a param write for the router
const carried = (history: History) => ({
  ...(history.location.state as Record<string, unknown> | null),
  [LOCATION_WRITE]: true,
});

export const historyAdapter = (history: History): Adapter => ({
  get: () => {
    const { pathname, search } = history.location;
    return `${strip(pathname, prefix(search))}${search}`;
  },

  push(href) {
    history.push(
      restore(href, prefix(history.location.search)),
      carried(history),
    );
  },

  replace(href) {
    history.replace(
      restore(href, prefix(history.location.search)),
      carried(history),
    );
  },

  // `listen` already fires for push, replace and pop alike, so there is no
  // separate notification for our own writes.
  subscribe: (listener) => history.listen(() => listener()),
});
