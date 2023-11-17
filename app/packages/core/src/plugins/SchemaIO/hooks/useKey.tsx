import { isNullish } from "@fiftyone/utilities";
import { get } from "lodash";
import { useCallback, useMemo } from "react";

const userChangedPaths = new Set<string>();
const pathsRefreshCount = new Map<string, number>();

export function useKey(
  path: string,
  schema: { default: unknown },
  data?: unknown,
  useData?: boolean
): [string, () => void] {
  const value = useMemo(() => {
    return useData ? data : data ?? get(schema, "default");
  }, [useData, data, schema]);
  const memoizedPath = useMemo(() => path, [path]);

  const key = useMemo(() => {
    let refreshCount: number = pathsRefreshCount.get(memoizedPath) || 0;
    if (!isNullish(value) && !userChangedPaths.has(memoizedPath)) {
      refreshCount++;
      pathsRefreshCount.set(memoizedPath, refreshCount);
    }
    return `${memoizedPath}-${refreshCount}`;
  }, [memoizedPath, value]);

  const setUserChanged = useCallback(() => {
    userChangedPaths.add(memoizedPath);
  }, [memoizedPath]);

  return [key, setUserChanged];
}

export function clearUseKeyStores() {
  userChangedPaths.clear();
  pathsRefreshCount.clear();
}

export function isPathUserChanged(path: string) {
  return userChangedPaths.has(path);
}
