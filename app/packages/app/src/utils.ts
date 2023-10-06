import { Router } from "./makeRoutes";
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

export function resolveURL(router: Router): string;
export function resolveURL(
  router: Router,
  dataset: string,
  view?: string
): string;
export function resolveURL(
  router: Router,
  dataset?: string,
  view?: string
): string {
  const params = new URLSearchParams(router.history.location.search);
  view ? params.set("view", encodeURIComponent(view)) : params.delete("view");
  let search = params.toString();
  if (search.length) {
    search = `?${search}`;
  }

  let path = "";
  const proxy = params.get("proxy");
  if (proxy) {
    path = decodeURIComponent(proxy);
  }

  if (dataset) {
    return `${path}/datasets/${encodeURIComponent(dataset)}${search}`;
  }

  return `${path}/${search}`;
}
