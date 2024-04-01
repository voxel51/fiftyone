import { matchPath } from "./routing";

export const getDatasetName = (pathname?: string) => {
  const result = matchPath(
    pathname || window.location.pathname,
    {
      path: "/datasets/:name",
    },
    window.location.search,
    {}
  );

  if (result) {
    return decodeURIComponent(result.variables.name);
  }

  return null;
};

export const getSavedViewName = (search?: string) => {
  const params = new URLSearchParams(search || window.location.search);
  const viewName = params.get("view");
  if (viewName) {
    return decodeURIComponent(viewName);
  }

  return null;
};

export function resolveURL(params: {
  currentSearch: string;
  currentPathname: string;
  nextDataset?: string | null;
  nextView?: string;
}): string {
  const searchParams = new URLSearchParams(params.currentSearch);

  if (!params.nextDataset && params.nextView) {
    throw new Error("a view cannot be provided without a dataset");
  }

  if (params.nextDataset) {
    params.nextView
      ? searchParams.set("view", encodeURIComponent(params.nextView))
      : searchParams.delete("view");
  }

  let newSearch = searchParams.toString();
  if (newSearch.length) {
    newSearch = `?${newSearch}`;
  }

  if (params.nextDataset === undefined) {
    // update search params only
    return `${params.currentPathname}${newSearch}`;
  }

  const path = decodeURIComponent(searchParams.get("proxy") ?? "");
  if (params.nextDataset === null) {
    // go to index page
    return `${path.length ? path : "/"}${newSearch}`;
  }

  // go to dataset
  return `${
    path.endsWith("/") ? path.slice(0, -1) : path
  }/datasets/${encodeURIComponent(params.nextDataset)}${newSearch}`;
}
