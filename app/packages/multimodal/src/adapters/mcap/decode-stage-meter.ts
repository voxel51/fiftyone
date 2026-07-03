/**
 * Realm-global stage meter for the worker's read pipeline.
 *
 * A worker request's `runMs` lumps together byte-fetch waits, chunk
 * decompression, cache-key hashing, and schema decode — which makes stalls
 * unattributable ("the link had headroom, so what was the lane doing?").
 * The hot paths (message-decoder, decode executor, decompress handlers)
 * report per-stage samples here; the playback worker installs a sink that
 * forwards them to the active request's attribution collector.
 *
 * The sink is only installed while latency debugging is enabled, so the
 * production cost is one null check per call site — no timing reads.
 */
export interface McapDecodeStageSample {
  /** Input bytes for hash/decode, decompressed output bytes for decompress. */
  readonly bytes: number;

  /** Schema name for decode samples, compression codec for decompress. */
  readonly label?: string;

  readonly ms: number;

  readonly stage: "decode" | "decompress" | "hash";

  readonly topic?: string;
}

export type McapDecodeStageSink = (sample: McapDecodeStageSample) => void;

let sink: McapDecodeStageSink | null = null;

export function setMcapDecodeStageSink(next: McapDecodeStageSink | null): void {
  sink = next;
}

export function isMcapDecodeStageMeterEnabled(): boolean {
  return sink !== null;
}

export function recordMcapDecodeStage(sample: McapDecodeStageSample): void {
  sink?.(sample);
}

export function mcapDecodeStageNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}
