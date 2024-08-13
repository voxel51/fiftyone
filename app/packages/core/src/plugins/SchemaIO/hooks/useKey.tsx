import { isNullish } from "@fiftyone/utilities";
import { get } from "lodash";
import { useCallback, useContext, useMemo } from "react";
import { ViewPropsType } from "../utils/types";
import { SchemaIOContext } from "./context";

const userChangedPathsById = new Map<string, Set<string>>();
const pathsRefreshCountById = new Map<string, Map<string, number>>();
const DEFAULT_ID = "__global__";

export function useKey(
  path: string,
  schema: ViewPropsType["schema"],
  data?: unknown,
  useData?: boolean
): [string, () => void] {
  const value = useMemo(() => {
    return useData ? data : data ?? get(schema, "default");
  }, [useData, data, schema]);
  const memoizedPath = useMemo(() => path, [path]);
  const { id = DEFAULT_ID } = useContext(SchemaIOContext);
  const userChangedPaths = getUserChangedPaths(id);
  const pathsRefreshCount = getPathsRefreshCount(id);

  const key = useMemo(() => {
    let refreshCount: number = pathsRefreshCount.get(memoizedPath) || 0;
    if (!isNullish(value) && !userChangedPaths.has(memoizedPath)) {
      refreshCount++;
      pathsRefreshCount.set(memoizedPath, refreshCount);
    }
    return `${memoizedPath}-${refreshCount}`;
  }, [memoizedPath, value, userChangedPaths, pathsRefreshCount]);

  const setUserChanged = useCallback(() => {
    userChangedPaths.add(memoizedPath);
  }, [memoizedPath, userChangedPaths]);

  return [key, setUserChanged];
}

export function clearUseKeyStores(id: string = DEFAULT_ID) {
  userChangedPathsById.delete(id);
  pathsRefreshCountById.delete(id);
}

export function isPathUserChanged(path: string, id: string = DEFAULT_ID) {
  const userChangedPaths = getUserChangedPaths(id);
  return userChangedPaths.has(path);
}

export function setPathUserUnchanged(path: string, id: string = DEFAULT_ID) {
  const userChangedPaths = getUserChangedPaths(id);
  userChangedPaths.delete(path);
}

function getUserChangedPaths(id: string) {
  if (!userChangedPathsById.has(id)) {
    userChangedPathsById.set(id, new Set<string>());
  }
  return userChangedPathsById.get(id) as Set<string>;
}

function getPathsRefreshCount(id: string) {
  if (!pathsRefreshCountById.has(id)) {
    pathsRefreshCountById.set(id, new Map<string, number>());
  }
  return pathsRefreshCountById.get(id) as Map<string, number>;
}
