import { Key, pathToRegexp } from "path-to-regexp";
import { OperationType, VariablesOf } from "relay-runtime";

interface CompilePathOptions {
  end: boolean;
  strict: boolean;
  sensitive: false;
}

interface CompilePathResult {
  regexp: RegExp;
  keys: Key[];
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

  const keys: Key[] = [];
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
}

export interface MatchPathResult<T extends OperationType | undefined> {
  path: string;
  url: string;
  isExact: boolean;
  variables: T extends OperationType ? VariablesOf<T> : undefined;
}

export const matchPath = <T extends OperationType | undefined>(
  pathname: string,
  options: MatchPathOptions,
  variables: T extends OperationType ? Partial<VariablesOf<T>> : undefined
): MatchPathResult<T> | null => {
  const { path, exact = false, strict = false, sensitive = false } = options;

  if (!path && path !== "") return null;

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

  variables && (variables = { ...variables });
  variables &&
    keys.forEach((key, i) => variables && (variables[key.name] = values[i]));

  return {
    path,
    url: path === "/" && url === "" ? "/" : url,
    isExact,
    variables,
  };
};

matchPath;
