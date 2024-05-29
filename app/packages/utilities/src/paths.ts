export enum PathType {
  URL,
  LINUX,
  WINDOWS,
}
import pathUtils from "path";

export function determinePathType(path: string): PathType {
  // http://, https://, s3://, min.io:// etc. - consider it a URL
  if (/^\S+:\/\//.test(path)) {
    return PathType.URL;
  }
  // backslashes = windows
  if (path?.includes("\\")) {
    return PathType.WINDOWS;
  }
  // linux by default
  return PathType.LINUX;
}

export function getSeparator(pathType: PathType): string {
  switch (pathType) {
    case PathType.URL:
    case PathType.LINUX:
      return "/";
    case PathType.WINDOWS:
      return "\\";
  }
}

function parseURL(url: string): [string, string] {
  const parts = url.split("://");
  const protocol = parts[0];
  const rest = parts[1];
  return [protocol, rest];
}

function joinURL(protocol: string, rest: string): string {
  if (rest === ".") rest = "";
  return `${protocol}://${rest}`;
}

export function joinPaths(...paths: string[]): string {
  const pathType = determinePathType(paths[0]);
  if (pathType === PathType.URL) {
    const [protocol, rest] = parseURL(paths[0]);
    const joined = pathUtils.join(rest, ...paths.slice(1));
    return joinURL(protocol, joined);
  }
  if (pathType === PathType.WINDOWS) {
    return pathUtils.win32.join(...paths);
  }
  return pathUtils.join(...paths);
}

export function resolveParent(path: string): string {
  if (path && path.endsWith("://")) return null;
  const pathType = determinePathType(path);
  if (pathType === PathType.URL) {
    const [protocol, rest] = parseURL(path);
    // remove trailing slash before split
    const restWithoutTrailingSlash = rest.replace(/\/$/, "");
    const parts = restWithoutTrailingSlash.split("/");
    parts.pop();
    let joined = pathUtils.join(...parts);
    if (!joined.endsWith("/") && parts.length > 0) {
      joined += "/";
    }
    return joinURL(protocol, joined);
  }
  const parsed =
    pathType === PathType.WINDOWS
      ? pathUtils.win32.parse(path)
      : pathUtils.parse(path);

  if (parsed.dir && parsed.dir !== path) {
    return parsed.dir;
  }
  return null;
}

export function resolveAncestors(path: string): string[] {
  const pathType = determinePathType(path);
  const sep = getSeparator(pathType);
  const parts = path.split(sep);
  const ancestors = [];

  while (parts.length > 0) {
    ancestors.push(parts.join(sep));
    parts.pop();
  }

  return ancestors;
}

export function getProtocol(path: string): string {
  const pathType = determinePathType(path);
  if (pathType === PathType.URL) {
    if (path.endsWith("://")) return path.slice(0, -3);
    const url = new URL(path);
    return url.protocol.replace(/:$/, "");
  }
}

export function getBasename(path: string) {
  const pathType = determinePathType(path);
  let result = null;
  if (pathType === PathType.URL) {
    const url = new URL(path);
    if (url.pathname) return pathUtils.basename(url.pathname);
    else if (url.hostname) result = url.hostname;
    else result = null;
  } else if (pathType === PathType.WINDOWS) {
    result = pathUtils.win32.basename(path);
  } else {
    result = pathUtils.basename(path);
  }
  if (result === "") return null;
  return result;
}

export function getRootOrProtocol(path: string) {
  const pathType = determinePathType(path);
  if (pathType === PathType.URL) {
    const protocol = getProtocol(path);
    return protocol + "://";
  }
  if (pathType === PathType.WINDOWS) {
    const parsed = pathUtils.win32.parse(path);
    return parsed.root;
  }
  return "/";
}
