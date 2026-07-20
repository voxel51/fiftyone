import type { TransformSample } from "../ir";
import type { EpisodeSession, FrameBatch, ReadRequest } from "../ports";

/** Collects one pull-based session read without changing adapter semantics. */
export async function readFrameBatches(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly FrameBatch[]> {
  const batches: FrameBatch[] = [];
  for await (const batch of session.read(request)) batches.push(batch);
  return batches;
}

/**
 * Runtime-owned synchronized-read fallback. Adapters may accelerate this exact
 * operation, but presentation code never forks on capability presence.
 */
export function readSynchronizedFallback(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly FrameBatch[]> {
  return readFrameBatches(session, request);
}

/** Reads a synchronized window through an equivalent fast path when present. */
export function readSynchronizedWindow(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly FrameBatch[]> {
  return (
    session.synchronizedRead?.readSynchronized(request) ??
    readSynchronizedFallback(session, request)
  );
}

/** Runtime-owned transform assembly fallback over ordinary frame reads. */
export async function readTransformsFallback(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly TransformSample[]> {
  const batches = await readFrameBatches(session, request);
  return batches
    .flatMap((batch) =>
      batch.frames.flatMap((frame) => frame.output.transforms ?? []),
    )
    .sort(compareTransforms);
}

/** Reads transforms through an equivalent adapter fast path when present. */
export function readTransformWindow(
  session: EpisodeSession,
  request: ReadRequest,
): Promise<readonly TransformSample[]> {
  return (
    session.transformRead?.readTransforms(request) ??
    readTransformsFallback(session, request)
  );
}

function compareTransforms(
  left: TransformSample,
  right: TransformSample,
): number {
  const leftTimeNs = left.timestampNs ?? -1n;
  const rightTimeNs = right.timestampNs ?? -1n;
  return leftTimeNs < rightTimeNs ? -1 : leftTimeNs > rightTimeNs ? 1 : 0;
}
