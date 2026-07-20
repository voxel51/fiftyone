/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type {
  CapabilityMessage,
  FrameWorkerOutbound,
} from "./frameWorkerProtocol";

/** The answer to "can WebCodecs decode this source video on demand?". */
export interface NativeDecodeProbeResult {
  decodable: boolean;
  /** Demuxed codec string when known. */
  codec?: string;
  /** Why not, when `decodable` is false (diagnostics). */
  reason?: string;
  /**
   * Whether the container carries an audio track (from the demuxed
   * `moov`'s track table). Undefined when the demux never got that far.
   */
  hasAudio?: boolean;
}

/** Give up (report not-decodable) if the probe hasn't answered by now. */
const PROBE_TIMEOUT_MS = 15_000;

/**
 * Probe whether `videoSrc` is decodable via WebCodecs, without mounting
 * anything. Spins up the WebCodecs worker in `probeOnly` mode — it streams only
 * far enough to demux the `moov` and run `isConfigSupported`, then this
 * terminates it. Cheap (a few hundred KB for faststart files) and keeps mp4box
 * in the worker chunk.
 *
 * Never rejects: any failure (fetch, demux, unsupported codec, timeout, worker
 * error, abort) resolves to `{ decodable: false }` so the resolver can fall
 * through. The caller should memoize the result (see `nativeDecodeCache`).
 */
export function probeNativeDecode(
  videoSrc: string,
  opts: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<NativeDecodeProbeResult> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("./videoDecodeWorker.ts", import.meta.url),
      { type: "module" },
    );

    let settled = false;

    const finish = (result: NativeDecodeProbeResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      opts.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      resolve(result);
    };

    const onMessage = (event: MessageEvent<FrameWorkerOutbound>) => {
      if (event.data?.type === "capability") {
        const msg = event.data as CapabilityMessage;
        finish({
          decodable: msg.decodable,
          codec: msg.codec,
          reason: msg.reason,
          hasAudio: msg.hasAudio,
        });
      }
    };

    const onError = () => finish({ decodable: false, reason: "worker error" });
    const onAbort = () => finish({ decodable: false, reason: "aborted" });

    const timer = setTimeout(
      () => finish({ decodable: false, reason: "probe timeout" }),
      PROBE_TIMEOUT_MS,
    );

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    opts.signal?.addEventListener("abort", onAbort);

    if (opts.signal?.aborted) {
      onAbort();
      return;
    }

    worker.postMessage({
      type: "init",
      videoSrc,
      headers: opts.headers,
      probeOnly: true,
    });
  });
}
