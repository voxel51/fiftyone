import { isMcapLatencyDebugEnabled } from "../mcap-debug-flags";

const GLOBAL_KEY = "__FIFTYONE_MCAP_LATENCY__";
const METRIC_PUBLISH_INTERVAL_MS = 250;
const BANDWIDTH_RECENT_SAMPLE_LIMIT = 80;

export { isMcapLatencyDebugEnabled };

type LatencyDetail = Record<string, unknown>;

interface McapLatencyEvent {
  readonly detail?: unknown;
  readonly elapsedMs: number;
  readonly name: string;
  readonly timeMs: number;
}

interface McapLatencyMetric {
  count: number;
  last: number;
  lastDetail?: unknown;
  max: number;
  min: number;
  total: number;
}

export interface McapLatencyBandwidthSample {
  readonly category: string;
  readonly decodedBytes?: number;
  readonly detail?: LatencyDetail;
  readonly effectiveBytes?: number;
  readonly messages?: number;
  readonly occurrences?: number;
  readonly operation: string;
  readonly phase?: string;
  readonly rawBytes?: number;
  readonly requestId?: string;
  readonly requestedTicks?: number;
  readonly requestedTopics?: number;
  readonly samples?: number;
  readonly topic?: string;
  readonly uniqueMessages?: number;
  readonly windows?: number;
}

interface McapLatencyBandwidthBucket {
  decodedBytes: number;
  effectiveBytes: number;
  entries: number;
  messages: number;
  occurrences: number;
  rawBytes: number;
  requestIds: Set<string>;
  requests: number;
  samples: number;
  uniqueMessages: number;
}

interface McapLatencyBandwidthState {
  readonly byCategory: Record<string, McapLatencyBandwidthBucket>;
  readonly byElapsedBucket: Record<string, McapLatencyBandwidthBucket>;
  readonly byOperation: Record<string, McapLatencyBandwidthBucket>;
  readonly byPhase: Record<string, McapLatencyBandwidthBucket>;
  readonly byTopic: Record<string, McapLatencyBandwidthBucket>;
  readonly recent: Array<
    McapLatencyBandwidthSample & { readonly elapsedMs: number }
  >;
  readonly total: McapLatencyBandwidthBucket;
}

interface McapLatencySession {
  bandwidth: McapLatencyBandwidthState;
  readonly events: McapLatencyEvent[];
  readonly label: string;
  readonly metrics: Record<string, McapLatencyMetric>;
  readonly seen: Set<string>;
  readonly sessionKey?: string;
  readonly sourceKey?: string;
  readonly startMs: number;
}

type McapLatencyGlobal = typeof globalThis & {
  [GLOBAL_KEY]?: McapLatencySession;
  document?: Document;
  window?: Window & typeof globalThis;
};

let pendingMetricPublish: ReturnType<typeof setTimeout> | null = null;

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

  if (pendingMetricPublish !== null) {
    clearTimeout(pendingMetricPublish);
    pendingMetricPublish = null;
  }

  root[GLOBAL_KEY] = {
    bandwidth: createBandwidthState(),
    events: [],
    label,
    metrics: {},
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
  publishMcapLatencySession(session, { immediate: true });

  try {
    globalThis.performance?.mark?.(
      `mcap-latency:${session.events.length}:${name}`,
    );
  } catch {
    // Performance marks are best-effort debug data.
  }
}

export function recordMcapLatencyMetric(
  name: string,
  value = 1,
  detail?: LatencyDetail,
): void {
  if (!isMcapLatencyDebugEnabled()) return;

  const session = ensureMcapLatencySession();
  const metric = (session.metrics[name] ??= {
    count: 0,
    last: 0,
    max: Number.NEGATIVE_INFINITY,
    min: Number.POSITIVE_INFINITY,
    total: 0,
  });
  metric.count += 1;
  metric.last = value;
  metric.max = Math.max(metric.max, value);
  metric.min = Math.min(metric.min, value);
  metric.total += value;
  if (detail) {
    metric.lastDetail = sanitizeLatencyDetail(detail);
  }
  publishMcapLatencySession(session);
}

export function recordMcapBandwidthSample(
  sample: McapLatencyBandwidthSample,
): void {
  if (!isMcapLatencyDebugEnabled()) return;

  const session = ensureMcapLatencySession();
  const elapsedMs = mcapLatencyNowMs() - session.startMs;
  const sanitizedSample = {
    ...sample,
    ...(sample.detail
      ? { detail: sanitizeLatencyDetail(sample.detail) as LatencyDetail }
      : {}),
  };
  const sampleWithElapsed = {
    ...sanitizedSample,
    elapsedMs: Number(elapsedMs.toFixed(1)),
  };
  const bandwidth = session.bandwidth;
  addToBandwidthBucket(bandwidth.total, sample);
  addToBandwidthMap(bandwidth.byCategory, sample.category, sample);
  addToBandwidthMap(bandwidth.byOperation, sample.operation, sample);
  addToBandwidthMap(
    bandwidth.byPhase,
    sample.phase ?? operationPhase(sample.operation),
    sample,
  );
  addToBandwidthMap(
    bandwidth.byElapsedBucket,
    elapsedBucketForMs(elapsedMs),
    sample,
  );
  if (sample.topic) {
    addToBandwidthMap(bandwidth.byTopic, sample.topic, sample);
  }
  bandwidth.recent.push(sampleWithElapsed);
  if (bandwidth.recent.length > BANDWIDTH_RECENT_SAMPLE_LIMIT) {
    bandwidth.recent.splice(
      0,
      bandwidth.recent.length - BANDWIDTH_RECENT_SAMPLE_LIMIT,
    );
  }
  publishMcapLatencySession(session);
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
  if (current) {
    current.bandwidth ??= createBandwidthState();
    return current;
  }

  const session: McapLatencySession = {
    bandwidth: createBandwidthState(),
    events: [],
    label: "mcap",
    metrics: {},
    seen: new Set(),
    startMs: mcapLatencyNowMs(),
  };
  root[GLOBAL_KEY] = session;
  return session;
}

function createBandwidthState(): McapLatencyBandwidthState {
  return {
    byCategory: {},
    byElapsedBucket: {},
    byOperation: {},
    byPhase: {},
    byTopic: {},
    recent: [],
    total: createBandwidthBucket(),
  };
}

function createBandwidthBucket(): McapLatencyBandwidthBucket {
  return {
    decodedBytes: 0,
    effectiveBytes: 0,
    entries: 0,
    messages: 0,
    occurrences: 0,
    rawBytes: 0,
    requestIds: new Set(),
    requests: 0,
    samples: 0,
    uniqueMessages: 0,
  };
}

function addToBandwidthMap(
  map: Record<string, McapLatencyBandwidthBucket>,
  key: string,
  sample: McapLatencyBandwidthSample,
) {
  addToBandwidthBucket((map[key] ??= createBandwidthBucket()), sample);
}

function addToBandwidthBucket(
  bucket: McapLatencyBandwidthBucket,
  sample: McapLatencyBandwidthSample,
) {
  const rawBytes = sample.rawBytes ?? 0;
  const decodedBytes = sample.decodedBytes ?? 0;
  bucket.rawBytes += rawBytes;
  bucket.decodedBytes += decodedBytes;
  bucket.effectiveBytes +=
    sample.effectiveBytes ?? (rawBytes > 0 ? rawBytes : decodedBytes);
  bucket.entries += 1;
  bucket.messages += sample.messages ?? sample.uniqueMessages ?? 0;
  bucket.occurrences += sample.occurrences ?? sample.messages ?? 0;
  if (sample.requestId) {
    bucket.requestIds.add(sample.requestId);
  } else {
    bucket.requests += 1;
  }
  bucket.samples += sample.samples ?? 0;
  bucket.uniqueMessages += sample.uniqueMessages ?? sample.messages ?? 0;
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

function operationPhase(operation: string): string {
  if (operation.includes("startup") || operation.includes("bootstrap")) {
    return "startup";
  }
  if (operation.includes("current")) {
    return "current-frame";
  }
  if (operation.includes("background") || operation.includes("range")) {
    return "background";
  }

  return "playback";
}

function elapsedBucketForMs(elapsedMs: number): string {
  if (elapsedMs < 1_000) return "0-1s";
  if (elapsedMs < 2_000) return "1-2s";
  if (elapsedMs < 5_000) return "2-5s";
  if (elapsedMs < 10_000) return "5-10s";
  return "10s+";
}

function publishMcapLatencySession(
  session: McapLatencySession,
  options?: { readonly immediate?: boolean },
): void {
  if (!options?.immediate) {
    scheduleMcapLatencySessionPublish(session);
    return;
  }
  publishMcapLatencySessionNow(session);
}

function scheduleMcapLatencySessionPublish(session: McapLatencySession): void {
  if (pendingMetricPublish !== null) return;
  pendingMetricPublish = setTimeout(() => {
    pendingMetricPublish = null;
    publishMcapLatencySessionNow(session);
  }, METRIC_PUBLISH_INTERVAL_MS);
}

function publishMcapLatencySessionNow(session: McapLatencySession): void {
  try {
    const root = globalThis as McapLatencyGlobal;
    const document = root.document ?? root.window?.document;
    if (!document) return;

    document.documentElement.setAttribute(
      "data-mcap-latency-events",
      JSON.stringify(session.events),
    );
    document.documentElement.setAttribute(
      "data-mcap-latency-metrics",
      JSON.stringify(session.metrics),
    );
    document.documentElement.setAttribute(
      "data-mcap-latency-bandwidth",
      JSON.stringify(summarizeBandwidth(session.bandwidth)),
    );
  } catch {
    // DOM publishing is best-effort debug data.
  }
}

function summarizeBandwidth(state: McapLatencyBandwidthState) {
  const total = state.total;
  return {
    byCategory: summarizeBandwidthMap(state.byCategory, total),
    byElapsedBucket: summarizeBandwidthMap(state.byElapsedBucket, total),
    byOperation: summarizeBandwidthMap(state.byOperation, total),
    byPhase: summarizeBandwidthMap(state.byPhase, total),
    byTopic: summarizeBandwidthMap(state.byTopic, total),
    recent: state.recent.map((sample) => ({
      ...sample,
      decodedKB: bytesToKb(sample.decodedBytes ?? 0),
      decodedMB: bytesToMb(sample.decodedBytes ?? 0),
      effectiveKB: bytesToKb(effectiveBytesForSample(sample)),
      effectiveMB: bytesToMb(effectiveBytesForSample(sample)),
      rawKB: bytesToKb(sample.rawBytes ?? 0),
      rawMB: bytesToMb(sample.rawBytes ?? 0),
    })),
    total: summarizeBandwidthBucket(total, total),
  };
}

function summarizeBandwidthMap(
  map: Record<string, McapLatencyBandwidthBucket>,
  total: McapLatencyBandwidthBucket,
) {
  return Object.fromEntries(
    Object.entries(map)
      .sort(
        ([, left], [, right]) =>
          right.effectiveBytes - left.effectiveBytes ||
          right.rawBytes - left.rawBytes,
      )
      .map(([key, bucket]) => [key, summarizeBandwidthBucket(bucket, total)]),
  );
}

function summarizeBandwidthBucket(
  bucket: McapLatencyBandwidthBucket,
  total: McapLatencyBandwidthBucket,
) {
  return {
    decodedBytes: bucket.decodedBytes,
    decodedKB: bytesToKb(bucket.decodedBytes),
    decodedMB: bytesToMb(bucket.decodedBytes),
    effectiveBytes: bucket.effectiveBytes,
    effectiveKB: bytesToKb(bucket.effectiveBytes),
    effectiveMB: bytesToMb(bucket.effectiveBytes),
    entries: bucket.entries,
    messages: bucket.messages,
    occurrences: bucket.occurrences,
    percentDecoded: percent(bucket.decodedBytes, total.decodedBytes),
    percentEffective: percent(bucket.effectiveBytes, total.effectiveBytes),
    percentRaw: percent(bucket.rawBytes, total.rawBytes),
    rawBytes: bucket.rawBytes,
    rawKB: bytesToKb(bucket.rawBytes),
    rawMB: bytesToMb(bucket.rawBytes),
    requests: bucket.requestIds.size + bucket.requests,
    samples: bucket.samples,
    uniqueMessages: bucket.uniqueMessages,
  };
}

function effectiveBytesForSample(sample: McapLatencyBandwidthSample): number {
  if (sample.effectiveBytes !== undefined) return sample.effectiveBytes;
  if (sample.rawBytes !== undefined && sample.rawBytes > 0) {
    return sample.rawBytes;
  }

  return sample.decodedBytes ?? 0;
}

function bytesToKb(bytes: number): number {
  return Number((bytes / 1024).toFixed(1));
}

function bytesToMb(bytes: number): number {
  return Number((bytes / (1024 * 1024)).toFixed(3));
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((value / total) * 100).toFixed(1));
}
