import type { SpaceNodeJSON } from "@fiftyone/spaces";
import type { ModalSelector, State } from "@fiftyone/state";
import { pathToRegexp } from "path-to-regexp";
import type { OperationType, VariablesOf } from "relay-runtime";

const compilePath = (path: string) =>
  pathToRegexp(path, {
    end: true,
    sensitive: false,
  });

export type LocationState<T extends OperationType = OperationType> = {
  event?: "modal" | "slice" | "spaces";
  fieldVisibility?: State.FieldVisibilityStage;
  groupSlice?: string;
  modalSelector?: ModalSelector;
  savedViewSlug?: string;
  view?: State.Stage[];
  workspace?: SpaceNodeJSON;
} & VariablesOf<T>;

interface MatchPathOptions<T extends OperationType> {
  path: string;
  searchParams?: { [key: string]: string };
  transform?: (
    state: LocationState<T>,
    variables: Partial<VariablesOf<T>>
  ) => VariablesOf<T>;
}

export interface MatchPathResult<T extends OperationType> {
  path: string;
  url: string;
  variables: VariablesOf<T>;
}

export const matchPath = <T extends OperationType>(
  pathname: string,
  options: MatchPathOptions<T>,
  search: string,
  state: LocationState<T>
): MatchPathResult<T> | null => {
  const { path, searchParams = {}, transform } = options;

  const params = new URLSearchParams(search);

  const proxy = decodeURIComponent(params.get("proxy") || "");

  let pathResult = pathname;
  if (proxy) {
    pathResult = `/${pathname.slice(proxy.length)}`.replace("//", "/");
  }

  const { regexp, keys } = compilePath(path);
  const match = regexp.exec(pathResult);

  if (!match) return null;
  const [url, ...values] = match;

  const all = new Map(Object.entries(state));

  for (const i in keys) {
    all.set(keys[i].name, decodeURIComponent(values[i]));
  }

  for (const [param, variable] of Object.entries(searchParams)) {
    if (params.has(param)) {
      all.set(variable, decodeURIComponent(params.get(param) || ""));
    }
  }

  const result: LocationState<T> = Object.fromEntries(all.entries());

  return {
    path,
    url: path === "/" && url === "" ? "/" : url,
    variables: transform ? transform(state, result) : result,
  };
};
