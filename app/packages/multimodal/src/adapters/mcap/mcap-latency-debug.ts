export function isMcapLatencyDebugEnabled(): boolean {
  return false;
}

export function startMcapLatencyDebugSession(
  ..._args: readonly unknown[]
): void {
  void _args;
}

export function markMcapLatencyEvent(..._args: readonly unknown[]): void {
  void _args;
}

export function recordMcapLatencyMetric(..._args: readonly unknown[]): void {
  void _args;
}

export function recordMcapBandwidthSample(..._args: readonly unknown[]): void {
  void _args;
}

export function mcapLatencyNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function mcapLatencyDurationMs(startMs: number): number {
  return Number((mcapLatencyNowMs() - startMs).toFixed(1));
}
