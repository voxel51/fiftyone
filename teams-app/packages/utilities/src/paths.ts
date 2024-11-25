import { getType } from "@fiftyone/teams-utilities";

export function ancestorPath(path: string, level: number, separator = "/") {
  const absoluteLevel = Math.abs(level);
  if (getType(path) !== "string" && absoluteLevel > 0) return path;
  const startPattern = new RegExp(`^${separator}`);
  const endPattern = new RegExp(`${separator}$`);
  const hasLeading = startPattern.test(path);
  const hasTrailing = endPattern.test(path);
  const trimPattern = new RegExp(`(^${separator}|${separator}$)`, "g");
  const sanitizedPath = path.replace(trimPattern, "");
  const ancestors = sanitizedPath.split(separator);
  const remainingAncestors = ancestors.slice(0, absoluteLevel * -1);
  let remainingPath = remainingAncestors.join(separator);
  if (hasLeading && (remainingAncestors.length !== 0 || !hasTrailing))
    remainingPath = separator + remainingPath;
  if (hasTrailing) remainingPath += separator;
  return remainingPath;
}

export function parentPath(path: string, separator = "/") {
  return ancestorPath(path, 1, separator);
}
