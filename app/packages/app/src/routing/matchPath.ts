import { State } from "@fiftyone/state";
import { Key, pathToRegexp } from "path-to-regexp";
import { OperationType, VariablesOf } from "relay-runtime";

interface StringKey extends Key {
  name: string;
}

interface CompilePathResult {
  regexp: RegExp;
  keys: StringKey[];
}

const compilePath = (path: string): CompilePathResult => {
  const keys: StringKey[] = [];
  const regexp = pathToRegexp(path, keys, {
    end: true,
    strict: false,
    sensitive: false,
  });
  const result = { regexp, keys };

  return result;
};

export type LocationState<T extends OperationType> = {
  view?: State.Stage[];
  savedViewSlug?: string;
  fieldVisibility?: State.FieldVisibilityStage;
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

  const proxy = params.get("proxy");
  if (proxy) {
    pathname = pathname.replace(proxy, "").replace("//", "/");
  }

  const { regexp, keys } = compilePath(path);
  const match = regexp.exec(pathname);

  if (!match) return null;
  const [url, ...values] = match;

  let all = keys.reduce((acc, key, i) => {
    return { ...acc, [key.name]: decodeURIComponent(values[i]) };
  }, state);

  Object.entries(searchParams).forEach(([param, variable]) => {
    if (params.has(param)) {
      all = {
        ...all,
        [variable]: decodeURIComponent(params.get(param) || ""),
      };
    }
  });

  return {
    path,
    url: path === "/" && url === "" ? "/" : url,
    variables: transform ? transform(state, all) : all,
  };
};
