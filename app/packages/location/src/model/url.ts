/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { RouteCodec } from "./route";
import type { LocationModel } from "./types";

export const parseUrl = <R>(
  codec: RouteCodec<R>,
  href: string,
): LocationModel<R> => {
  const [withoutFragment] = href.split("#");
  const cut = withoutFragment.indexOf("?");
  const pathname = cut === -1 ? withoutFragment : withoutFragment.slice(0, cut);
  const search = cut === -1 ? "" : withoutFragment.slice(cut + 1);

  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    params[key] = value;
  }

  return { route: codec.parse(pathname), params };
};

/**
 * Params are sorted so the same model always formats to the same string,
 * whatever order keys were written or registered in.
 */
export const formatUrl = <R>(
  codec: RouteCodec<R>,
  model: LocationModel<R>,
): string => {
  const search = new URLSearchParams();
  for (const key of Object.keys(model.params).sort()) {
    search.set(key, model.params[key]);
  }
  const query = search.toString();
  const path = codec.format(model.route);
  return query ? `${path}?${query}` : path;
};
