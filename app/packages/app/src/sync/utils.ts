import { Location } from "history";
import { matchPath } from "../routing";

export const getDatasetName = (location: Location) => {
  const result = matchPath(
    location.pathname,
    {
      path: "/datasets/:name",
    },
    "",
    {}
  );

  if (result) {
    return decodeURIComponent(result.variables.name);
  }

  return null;
};

export const getSavedViewName = (location: Location) => {
  const params = new URLSearchParams(location.search);
  const viewName = params.get("view");
  if (viewName) {
    return decodeURIComponent(viewName);
  }

  return null;
};
