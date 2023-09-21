import { isNullish } from "@fiftyone/utilities";
import { get } from "lodash";
import { useCallback, useMemo } from "react";

// todo: move to state?
const userChangedPaths = new Set<string>();
const pathsRefreshCount = new Map<string, number>();

export function useKey(
  path: string,
  schema: { default: unknown }
): [string, () => void] {
  const key = useMemo(() => {
    let refreshCount: number = pathsRefreshCount.get(path) || 0;
    if (!isNullish(get(schema, "default")) && !userChangedPaths.has(path)) {
      refreshCount++;
      pathsRefreshCount.set(path, refreshCount);
    }
    return `${path}-${refreshCount}`;
  }, [path, schema]);

  const setUserChanged = useCallback(() => {
    userChangedPaths.add(path);
  }, [path]);

  return [key, setUserChanged];
}

export function clearUseKeyStores() {
  userChangedPaths.clear();
  pathsRefreshCount.clear();
}

export function isPathUserChanged(path: string) {
  return userChangedPaths.has(path);
}
