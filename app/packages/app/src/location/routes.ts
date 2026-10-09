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

const encode = (value: string) => encodeURIComponent(value);

const DATASETS = "datasets";
const SAMPLES = "samples";
const GROUPS = "groups";

export type SamplePath = { kind: "sample" | "group"; id: string };

const SAMPLE_PATH = new RegExp(
  `^(.*/${DATASETS}/[^/]+)/(${SAMPLES}|${GROUPS})/([^/]+)/?$`,
);

/**
 * A raw pathname, proxy prefix and all, as its dataset page plus the sample
 * open on it. The router keys pages on `page`, so opening a sample is not a
 * page change.
 */
export const splitSamplePath = (
  pathname: string,
): { page: string; sample?: SamplePath } => {
  const match = SAMPLE_PATH.exec(pathname);
  if (!match) return { page: pathname };
  return {
    page: match[1],
    sample: {
      kind: match[2] === GROUPS ? "group" : "sample",
      id: decodeURIComponent(match[3]),
    },
  };
};

export const samplePathSuffix = (sample?: SamplePath) =>
  sample
    ? `/${sample.kind === "group" ? GROUPS : SAMPLES}/${encode(sample.id)}`
    : "";

export const appRoutes: RouteCodec<AppRoute> = {
  parse(pathname) {
    const [root, name, kind, id] = pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);

    if (!root) return { kind: "index" };
    if (root !== DATASETS || !name) return { kind: "unknown", path: pathname };
    if (!kind) return { kind: "dataset", name };
    if (kind === SAMPLES && id) return { kind: "sample", name, id };
    if (kind === GROUPS && id) return { kind: "group", name, groupId: id };
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
        return `/${DATASETS}/${encode(route.name)}${samplePathSuffix({
          kind: "sample",
          id: route.id,
        })}`;
      case "group":
        return `/${DATASETS}/${encode(route.name)}${samplePathSuffix({
          kind: "group",
          id: route.groupId,
        })}`;
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
