const DEBUG_PARAM = "mcapLatencyDebug";
const STORAGE_KEY = "fiftyone.mcap.latencyDebug";

type McapDebugGlobal = typeof globalThis & {
  document?: Document;
  localStorage?: Storage;
  window?: Window & typeof globalThis;
};

let debugEnabledCache: {
  readonly key: string;
  readonly value: boolean;
} | null = null;

export function isMcapLatencyDebugEnabled(): boolean {
  const root = globalThis as McapDebugGlobal;
  const cacheKey = latencyDebugCacheKey(root);
  if (debugEnabledCache?.key === cacheKey) {
    return debugEnabledCache.value;
  }

  for (const location of getBrowserLocations(root)) {
    try {
      if (hasLatencyDebugParam(location.search)) {
        debugEnabledCache = { key: cacheKey, value: true };
        return true;
      }
      if (hasLatencyDebugParam(location.hash)) {
        debugEnabledCache = { key: cacheKey, value: true };
        return true;
      }
      if (hasLatencyDebugParam(location.href)) {
        debugEnabledCache = { key: cacheKey, value: true };
        return true;
      }
    } catch {
      // Ignore inaccessible frame locations.
    }
  }

  try {
    const enabled =
      root.localStorage?.getItem(STORAGE_KEY) === "1" ||
      root.window?.localStorage?.getItem(STORAGE_KEY) === "1";
    debugEnabledCache = { key: cacheKey, value: enabled };
    return enabled;
  } catch {
    debugEnabledCache = { key: cacheKey, value: false };
    return false;
  }
}

function getBrowserLocations(root: McapDebugGlobal): Location[] {
  const locations: Location[] = [];

  for (const location of [
    root.location,
    root.window?.location,
    root.document?.location,
  ]) {
    if (location && !locations.includes(location)) {
      locations.push(location);
    }
  }

  for (const frameWindow of [root.parent, root.top]) {
    try {
      const location = frameWindow?.location;
      if (location && !locations.includes(location)) {
        locations.push(location);
      }
    } catch {
      // Ignore cross-origin frame locations.
    }
  }

  return locations;
}

function hasLatencyDebugParam(value: string | undefined): boolean {
  if (!value) return false;
  if (value.includes(`${DEBUG_PARAM}=1`)) return true;

  try {
    return (
      new URLSearchParams(value.startsWith("?") ? value : `?${value}`).get(
        DEBUG_PARAM,
      ) === "1"
    );
  } catch {
    return value.includes(`${DEBUG_PARAM}=1`);
  }
}

function latencyDebugCacheKey(root: McapDebugGlobal): string {
  for (const location of getBrowserLocations(root)) {
    try {
      return location.href;
    } catch {
      // Ignore inaccessible frame locations.
    }
  }

  return "unknown";
}
