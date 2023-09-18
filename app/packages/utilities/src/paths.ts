export enum PathType {
  URL,
  LINUX,
  WINDOWS,
}
import pathUtils from "path";

export function determinePathType(path: string): PathType {
  // http://, https://, s3://, etc. - consider it a URL
  if (/^\w+:\/\//.test(path)) {
    return PathType.URL;
  }
  // backslashes = windows
  if (path.includes("\\")) {
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

export function joinPaths(...paths: string[]): string {
  const pathType = determinePathType(paths[0]);
  if (pathType === PathType.URL) {
    const url = new URL(paths[0]);
    url.pathname = pathUtils.join(url.pathname, ...paths.slice(1));
    return url.toString();
  }
  if (pathType === PathType.WINDOWS) {
    return pathUtils.win32.join(...paths);
  }
  return pathUtils.join(...paths);
}

export function resolveParent(path: string): string {
  const pathType = determinePathType(path);
  if (pathType === PathType.URL) {
    const protocol = getProtocol(path);
    if (path === protocol + "://") return null;
    const url = new URL(path);
    if (url.pathname) {
      url.pathname = pathUtils.dirname(url.pathname);
    } else {
      return protocol + "://";
    }
    return url.toString();
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
    console.log(parsed);
    return parsed.root;
  }
  return "/";
}
