import { Key, pathToRegexp } from "path-to-regexp";
import { OperationType, VariablesOf } from "relay-runtime";

interface StringKey extends Key {
  name: string;
}

interface CompilePathOptions {
  end: boolean;
  strict: boolean;
  sensitive: false;
}

interface CompilePathResult {
  regexp: RegExp;
  keys: StringKey[];
}

const cache: {
  [key: string]: {
    [key: string]: CompilePathResult;
  };
} = {};
const cacheLimit = 10000;
let cacheCount = 0;

const compilePath = (
  path: string,
  options: CompilePathOptions
): CompilePathResult => {
  const cacheKey = `${options.end}${options.strict}${options.sensitive}`;
  const pathCache = cache[cacheKey] || (cache[cacheKey] = {});

  if (pathCache[path]) return pathCache[path];

  const keys: StringKey[] = [];
  const regexp = pathToRegexp(path, keys, options);
  const result = { regexp, keys };

  if (cacheCount < cacheLimit) {
    pathCache[path] = result;
    cacheCount++;
  }

  return result;
};

interface MatchPathOptions {
  exact?: boolean;
  strict?: boolean;
  sensitive?: false;
  path?: string;
  queryParams?: { [key: string]: string };
}

export interface MatchPathResult<T extends OperationType | undefined> {
  path: string;
  url: string;
  isExact: boolean;
  variables: VariablesOf<T extends OperationType ? T : never>;
}

export const matchPath = <T extends OperationType | undefined>(
  pathname: string,
  options: MatchPathOptions,
  variables: Partial<VariablesOf<T extends OperationType ? T : never>> = {},
  search: string
): MatchPathResult<T> | null => {
  const {
    path,
    exact = false,
    strict = false,
    sensitive = false,
    queryParams = {},
  } = options;

  if (!path || path === "") return null;

  const { regexp, keys } = compilePath(path, {
    end: exact,
    strict,
    sensitive,
  });
  const match = regexp.exec(pathname);

  if (!match) return null;

  const [url, ...values] = match;
  const isExact = pathname === url;

  if (exact && !isExact) return null;

  const allVariables: VariablesOf<T extends OperationType ? T : never> = {
    ...variables,
  };
  keys.forEach((key, i) => {
    // @ts-ignore
    allVariables[key.name] = decodeURIComponent(values[i]);
  });

  const params = new URLSearchParams(search);
  Object.entries(queryParams).forEach(([param, variable]) => {
    if (params.has(param)) {
      // @ts-ignore
      allVariables[variable] = decodeURIComponent(params.get(param));
    }
  });

  return {
    path,
    url: path === "/" && url === "" ? "/" : url,
    isExact,
    variables: allVariables,
  };
};
