const GLOBAL_KEY = "__FIFTYONE_MODAL_LOADING_LATENCY__";
const EVENTS_ATTRIBUTE = "data-modal-loading-latency-events";
const MAX_EVENTS = 100;

/** User action that initiated a modal loading session. */
export type ModalLoadingEntryPath =
  | "grid"
  | "next"
  | "previous"
  | "reopen"
  | "unknown";

type ModalLoadingLatencyDetail = Record<string, unknown>;

/** Debug event published during a modal loading session. */
export interface ModalLoadingLatencyEvent {
  readonly detail?: unknown;
  readonly elapsedMs: number;
  readonly name: string;
  readonly timeMs: number;
}

interface ModalLoadingLatencySession {
  readonly entryPath: ModalLoadingEntryPath;
  readonly events: ModalLoadingLatencyEvent[];
  readonly seen: Set<string>;
  readonly startMs: number;
}

type ModalLoadingLatencyGlobal = typeof globalThis & {
  [GLOBAL_KEY]?: ModalLoadingLatencySession;
  document?: Document;
  location?: Location;
  window?: Window & typeof globalThis;
};

/** Returns whether modal latency instrumentation is enabled by the URL. */
export function isModalLoadingLatencyDebugEnabled(): boolean {
  const root = globalThis as ModalLoadingLatencyGlobal;
  const locations = [
    root.location,
    root.window?.location,
    root.document?.location,
  ];

  for (const location of locations) {
    try {
      const value = location?.href ?? location?.search;
      if (value?.includes("modalLoadingLatencyDebug=1")) {
        return true;
      }
    } catch {
      // Ignore inaccessible frame locations.
    }
  }

  return false;
}

/** Starts a bounded latency trace for one modal entry or navigation action. */
export function startModalLoadingLatencySession({
  detail,
  entryPath,
}: {
  readonly detail?: ModalLoadingLatencyDetail;
  readonly entryPath: ModalLoadingEntryPath;
}): void {
  if (!isModalLoadingLatencyDebugEnabled()) {
    return;
  }

  const root = globalThis as ModalLoadingLatencyGlobal;
  root[GLOBAL_KEY] = {
    entryPath,
    events: [],
    seen: new Set(),
    startMs: modalLoadingLatencyNowMs(),
  };
  markModalLoadingLatencyEvent("session start", {
    entryPath,
    ...detail,
  });
}

/** Records a point-in-time event in the active modal latency trace. */
export function markModalLoadingLatencyEvent(
  name: string,
  detail?: ModalLoadingLatencyDetail,
  options?: { readonly onceKey?: string },
): void {
  if (!isModalLoadingLatencyDebugEnabled()) {
    return;
  }

  const root = globalThis as ModalLoadingLatencyGlobal;
  const session = root[GLOBAL_KEY];
  if (!session) {
    return;
  }

  const onceKey = options?.onceKey;
  if (onceKey) {
    if (session.seen.has(onceKey)) {
      return;
    }
    session.seen.add(onceKey);
  }

  const timeMs = modalLoadingLatencyNowMs();
  session.events.push({
    ...(detail ? { detail: sanitizeLatencyDetail(detail) } : {}),
    elapsedMs: Number((timeMs - session.startMs).toFixed(1)),
    name,
    timeMs,
  });
  if (session.events.length > MAX_EVENTS) {
    session.events.splice(0, session.events.length - MAX_EVENTS);
  }

  try {
    globalThis.performance?.mark?.(`modal-loading:${name}`);
  } catch {
    // Performance marks are best-effort debug data.
  }

  publishModalLoadingLatencySession(session);
}

/**
 * Marks a committed React state after the browser has had a paint opportunity.
 * Two animation frames avoid labeling a before-paint rAF callback as painted.
 */
export function markModalLoadingLatencyEventAfterPaint(
  name: string,
  detail?: ModalLoadingLatencyDetail,
  options?: { readonly onceKey?: string },
): () => void {
  if (!isModalLoadingLatencyDebugEnabled()) {
    return () => undefined;
  }

  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis);
  if (!requestFrame) {
    markModalLoadingLatencyEvent(name, detail, options);
    return () => undefined;
  }

  let firstFrame: number | null = null;
  let secondFrame: number | null = null;
  firstFrame = requestFrame(() => {
    firstFrame = null;
    secondFrame = requestFrame(() => {
      secondFrame = null;
      markModalLoadingLatencyEvent(name, detail, options);
    });
  });

  return () => {
    if (!cancelFrame) {
      return;
    }
    if (firstFrame !== null) {
      cancelFrame(firstFrame);
    }
    if (secondFrame !== null) {
      cancelFrame(secondFrame);
    }
  };
}

function modalLoadingLatencyNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function publishModalLoadingLatencySession(
  session: ModalLoadingLatencySession,
): void {
  try {
    const root = globalThis as ModalLoadingLatencyGlobal;
    const document = root.document ?? root.window?.document;
    document?.documentElement.setAttribute(
      EVENTS_ATTRIBUTE,
      JSON.stringify(session.events),
    );
  } catch {
    // DOM publishing is best-effort debug data.
  }
}

function sanitizeLatencyDetail(
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
      ? value.toISOString()
      : "Invalid Date";
  }
  if (value && typeof value === "object") {
    if (ancestors.has(value)) {
      return "[Circular]";
    }
    ancestors.add(value);
    let sanitized: unknown;
    if (Array.isArray(value)) {
      sanitized = value.map((item) => sanitizeLatencyDetail(item, ancestors));
    } else if (value instanceof Map) {
      sanitized = Array.from(value, ([key, nested]) => [
        sanitizeLatencyDetail(key, ancestors),
        sanitizeLatencyDetail(nested, ancestors),
      ]);
    } else if (value instanceof Set) {
      sanitized = Array.from(value, (item) =>
        sanitizeLatencyDetail(item, ancestors),
      );
    } else {
      sanitized = Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          sanitizeLatencyDetail(nested, ancestors),
        ]),
      );
    }
    ancestors.delete(value);
    return sanitized;
  }

  return value;
}
