const DEBUG_PARAM = "mcapLatencyDebug";
const STORAGE_KEY = "fiftyone.mcap.latencyDebug";
const GLOBAL_KEY = "__FIFTYONE_MCAP_LATENCY__";

type LatencyDetail = Record<string, unknown>;

interface McapLatencyEvent {
  readonly detail?: unknown;
  readonly elapsedMs: number;
  readonly name: string;
  readonly timeMs: number;
}

interface McapLatencySession {
  readonly events: McapLatencyEvent[];
  readonly label: string;
  readonly seen: Set<string>;
  readonly sessionKey?: string;
  readonly sourceKey?: string;
  readonly startMs: number;
}

type McapLatencyGlobal = typeof globalThis & {
  [GLOBAL_KEY]?: McapLatencySession;
  document?: Document;
  localStorage?: Storage;
  window?: Window & typeof globalThis;
};

export function isMcapLatencyDebugEnabled(): boolean {
  const root = globalThis as McapLatencyGlobal;

  for (const location of getBrowserLocations(root)) {
    try {
      if (hasLatencyDebugParam(location.search)) {
        return true;
      }
      if (hasLatencyDebugParam(location.hash)) {
        return true;
      }
      if (hasLatencyDebugParam(location.href)) {
        return true;
      }
    } catch {
      // Ignore inaccessible frame locations.
    }
  }

  try {
    return (
      root.localStorage?.getItem(STORAGE_KEY) === "1" ||
      root.window?.localStorage?.getItem(STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function startMcapLatencyDebugSession({
  detail,
  label,
  sessionKey,
  sourceKey,
}: {
  readonly detail?: LatencyDetail;
  readonly label: string;
  readonly sessionKey?: string;
  readonly sourceKey?: string;
}): void {
  if (!isMcapLatencyDebugEnabled()) return;

  const root = globalThis as McapLatencyGlobal;
  const current = root[GLOBAL_KEY];
  if (
    current &&
    current.sessionKey === sessionKey &&
    current.sourceKey === sourceKey
  ) {
    return;
  }

  root[GLOBAL_KEY] = {
    events: [],
    label,
    seen: new Set(),
    sessionKey,
    sourceKey,
    startMs: mcapLatencyNowMs(),
  };
  markMcapLatencyEvent("session start", detail);
}

export function markMcapLatencyEvent(
  name: string,
  detail?: LatencyDetail,
  options?: { readonly onceKey?: string },
): void {
  if (!isMcapLatencyDebugEnabled()) return;

  const session = ensureMcapLatencySession();
  const onceKey = options?.onceKey;
  if (onceKey) {
    if (session.seen.has(onceKey)) return;
    session.seen.add(onceKey);
  }

  const timeMs = mcapLatencyNowMs();
  const elapsedMs = timeMs - session.startMs;
  const event: McapLatencyEvent = {
    ...(detail ? { detail: sanitizeLatencyDetail(detail) } : {}),
    elapsedMs,
    name,
    timeMs,
  };
  session.events.push(event);
  publishMcapLatencySession(session);

  try {
    globalThis.performance?.mark?.(
      `mcap-latency:${session.events.length}:${name}`,
    );
  } catch {
    // Performance marks are best-effort debug data.
  }
}

export function mcapLatencyNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function mcapLatencyDurationMs(startMs: number): number {
  return Number((mcapLatencyNowMs() - startMs).toFixed(1));
}

function ensureMcapLatencySession(): McapLatencySession {
  const root = globalThis as McapLatencyGlobal;
  const current = root[GLOBAL_KEY];
  if (current) return current;

  const session: McapLatencySession = {
    events: [],
    label: "mcap",
    seen: new Set(),
    startMs: mcapLatencyNowMs(),
  };
  root[GLOBAL_KEY] = session;
  return session;
}

function sanitizeLatencyDetail(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeLatencyDetail);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        sanitizeLatencyDetail(nested),
      ]),
    );
  }

  return value;
}

function getBrowserLocations(root: McapLatencyGlobal): Location[] {
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

function publishMcapLatencySession(session: McapLatencySession): void {
  try {
    const root = globalThis as McapLatencyGlobal;
    const document = root.document ?? root.window?.document;
    document?.documentElement.setAttribute(
      "data-mcap-latency-events",
      JSON.stringify(session.events),
    );
  } catch {
    // DOM publishing is best-effort debug data.
  }
}
