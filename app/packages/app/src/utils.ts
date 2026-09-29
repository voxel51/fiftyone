/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { samplePathSuffix, splitSamplePath } from "./location/routes";
import { matchPath } from "./routing";

export const getDatasetName = (pathname?: string) => {
  const result = matchPath(
    splitSamplePath(pathname || window.location.pathname).page,
    {
      path: "/datasets/:name",
    },
    window.location.search,
    {},
  );

  if (result) {
    return decodeURIComponent(result.variables.name);
  }

  return null;
};

export const getParam = (name: string, search?: string) => {
  const params = new URLSearchParams(search || window.location.search);
  const value = params.get(name);

  return value ? decodeURIComponent(value) : null;
};

export function resolveURL(params: {
  currentSearch: string;
  currentPathname: string;
  nextDataset?: string | null;
  nextView?: string;
  extra?: { [key: string]: string | null };
}): string {
  const searchParams = new URLSearchParams(params.currentSearch);
  const current = splitSamplePath(params.currentPathname);
  const { groupId, id, ...extra } = params.extra ?? {};

  // the open sample is a path, kept while the dataset is
  let sample =
    params.nextDataset === undefined ||
    current.page.endsWith(
      `/datasets/${encodeURIComponent(params.nextDataset ?? "")}`,
    )
      ? current.sample
      : undefined;
  if (groupId !== undefined || id !== undefined) {
    sample = groupId
      ? { kind: "group", id: groupId }
      : id
        ? { kind: "sample", id }
        : undefined;
  }
  const suffix = samplePathSuffix(sample);

  if (
    params.nextDataset !== undefined &&
    (params.nextDataset === null ||
      !params.currentPathname.endsWith(
        `/datasets/${encodeURIComponent(params.nextDataset)}`,
      ))
  ) {
    searchParams.delete("subset");
    searchParams.delete("subsetScope");
  }

  if (!params.nextDataset && params.nextView) {
    throw new Error("a view cannot be provided without a dataset");
  }

  if (params.nextDataset) {
    params.nextView
      ? searchParams.set("view", encodeURIComponent(params.nextView))
      : searchParams.delete("view");
  }

  for (const param in extra) {
    const value = extra[param];
    if (value === null) {
      searchParams.delete(param);
      continue;
    }

    searchParams.set(param, encodeURIComponent(value));
  }

  let newSearch = searchParams.toString();
  if (newSearch.length) {
    newSearch = `?${newSearch}`;
  }

  if (params.nextDataset === undefined) {
    // update search params only
    return `${current.page}${suffix}${newSearch}`;
  }

  const path = decodeURIComponent(searchParams.get("proxy") ?? "");
  if (params.nextDataset === null) {
    // go to index page
    return `${path.length ? path : "/"}${newSearch}`;
  }

  // go to dataset
  return `${
    path.endsWith("/") ? path.slice(0, -1) : path
  }/datasets/${encodeURIComponent(params.nextDataset)}${suffix}${newSearch}`;
}
