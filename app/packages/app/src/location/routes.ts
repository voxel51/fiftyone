/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { RouteCodec } from "@fiftyone/location";

/**
 * What a path means in the OSS app. `unknown` carries anything this app does
 * not serve, so writing a param can never rewrite a path we do not recognize.
 */
export type AppRoute =
  | { kind: "index" }
  | { kind: "dataset"; name: string }
  | { kind: "sample"; name: string; id: string }
  | { kind: "group"; name: string; groupId: string }
  | { kind: "unknown"; path: string };

const DATASETS = "datasets";

const encode = (value: string) => encodeURIComponent(value);

export const appRoutes: RouteCodec<AppRoute> = {
  parse(pathname) {
    const [root, name, kind, id] = pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);

    if (!root) return { kind: "index" };
    if (root !== DATASETS || !name) return { kind: "unknown", path: pathname };
    if (!kind) return { kind: "dataset", name };
    if (kind === "sample" && id) return { kind: "sample", name, id };
    if (kind === "group" && id) return { kind: "group", name, groupId: id };
    return { kind: "unknown", path: pathname };
  },

  format(route) {
    switch (route.kind) {
      case "index":
        return "/";
      case "unknown":
        return route.path;
      case "dataset":
        return `/${DATASETS}/${encode(route.name)}`;
      case "sample":
        return `/${DATASETS}/${encode(route.name)}/sample/${encode(route.id)}`;
      case "group":
        return `/${DATASETS}/${encode(route.name)}/group/${encode(
          route.groupId,
        )}`;
    }
  },

  scopes(route) {
    switch (route.kind) {
      case "dataset":
        return { dataset: route.name };
      case "sample":
        return { dataset: route.name, sample: route.id };
      case "group":
        return { dataset: route.name, sample: route.groupId };
      default:
        return {};
    }
  },
};
