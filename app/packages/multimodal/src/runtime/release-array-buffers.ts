/**
 * Moves ArrayBuffer backing stores out of the current V8 isolate and drops
 * them. Transferring through a closed MessageChannel detaches synchronously;
 * closing both ports discards the queued payload without creating another
 * long-lived worker or cache owner.
 */
export function releaseArrayBuffers(candidates: Iterable<ArrayBuffer>): number {
  const buffers = [...new Set(candidates)].filter(
    (buffer) => buffer.byteLength > 0,
  );
  if (buffers.length === 0 || typeof MessageChannel === "undefined") return 0;

  const releasedBytes = buffers.reduce(
    (total, buffer) => total + buffer.byteLength,
    0,
  );
  const channel = new MessageChannel();
  try {
    channel.port1.postMessage(null, buffers);
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
  return releasedBytes;
}
