import { Key, pathToRegexp } from "path-to-regexp";

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

export interface MatchPathResult {
  path: string;
  url: string;
  isExact: boolean;
  params: {
    [key: string]: string;
  };
}

export const matchPath = (
  pathname: string,
  options: MatchPathOptions
): MatchPathResult | null => {
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

  return {
    path,
    url: path === "/" && url === "" ? "/" : url,
    isExact,
    params: keys.reduce(
      (memo: { [key: string]: string }, key: Key, index: number) => {
        memo[key.name] = values[index];
        return memo;
      },
      {}
    ),
  };
};

matchPath;
