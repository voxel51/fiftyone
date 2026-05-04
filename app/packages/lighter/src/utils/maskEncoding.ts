/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Encodes a mask canvas into the base64-encoded, zlib-compressed numpy format
 * that FiftyOne stores in the database.
 *
 * Pipeline: canvas → uint8 mask → numpy .npy → zlib deflate → base64
 */

/**
 * Encodes a mask editing canvas into a base64 string matching FiftyOne's
 * stored mask format.
 *
 * @param canvas - The mask editing canvas (RGBA). Any pixel with non-zero
 *   alpha is treated as masked (value 1); fully transparent pixels are 0.
 * @returns Base64-encoded, zlib-compressed numpy array string.
 */
export async function encodeMask(canvas: HTMLCanvasElement): Promise<string> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2d context from mask canvas");

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);

  // Extract single-channel uint8: non-zero alpha → 1, zero → 0
  const mask = new Uint8Array(width * height);
  const rgba = imageData.data;
  for (let i = 0; i < mask.length; i++) {
    mask[i] = rgba[i * 4 + 3] > 0 ? 1 : 0;
  }

  return encodeMaskData(mask, [height, width]);
}

/**
 * Encodes a raw uint8 mask array into a base64 string matching FiftyOne's
 * stored mask format.
 *
 * @param mask - Flat uint8 array of mask values.
 * @param shape - Array shape (e.g. `[height, width]` or `[height, width, channels]`).
 * @returns Base64-encoded, zlib-compressed numpy array string.
 */
export async function encodeMaskData(
  mask: Uint8Array,
  shape: readonly number[]
): Promise<string> {
  if (
    (shape.length !== 2 && shape.length !== 3) ||
    shape.some((dim) => !Number.isInteger(dim) || dim <= 0)
  ) {
    throw new Error(
      "Mask shape must be 2D or 3D with positive integer dimensions"
    );
  }

  const expectedLength = shape.reduce((product, dim) => product * dim, 1);
  if (mask.length !== expectedLength) {
    throw new Error(
      `Mask length ${mask.length} does not match shape ${shape.join("x")}`
    );
  }

  const npy = buildNpy(mask, shape);
  const compressed = await deflate(npy);

  const bytes = new Uint8Array(compressed);
  const CHUNK_SIZE = 0x8000;
  const parts: string[] = [];

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }

  return btoa(parts.join(""));
}

/**
 * Builds a numpy v1.0 `.npy` byte array.
 *
 * Format spec: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 *
 * @param data - Flat uint8 array of mask values.
 * @param shape - Array shape.
 * @returns Uint8Array containing the complete .npy file.
 */
function buildNpy(data: Uint8Array, shape: readonly number[]): Uint8Array {
  // Header dict — must match what numpy's parse expects.
  // 1-tuples need a trailing comma: `(N,)` not `(N)`.
  const shapeStr =
    shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(", ")})`;
  const headerStr = `{'descr': '|u1', 'fortran_order': False, 'shape': ${shapeStr}, }`;

  // Pad header so that magic(6) + version(2) + headerLen(2) + header is
  // aligned to a 64-byte boundary, terminated by a newline.
  const preambleLen = 10; // magic(6) + version(2) + headerLen(2)
  const rawLen = preambleLen + headerStr.length + 1; // +1 for trailing \n
  const padded = Math.ceil(rawLen / 64) * 64;
  const paddingLen = padded - rawLen;
  const headerBytes = headerStr + " ".repeat(paddingLen) + "\n";
  const headerLen = headerBytes.length;

  const totalLen = preambleLen + headerLen + data.length;
  const buf = new Uint8Array(totalLen);

  // Magic: \x93NUMPY
  buf[0] = 0x93;
  buf[1] = 0x4e; // N
  buf[2] = 0x55; // U
  buf[3] = 0x4d; // M
  buf[4] = 0x50; // P
  buf[5] = 0x59; // Y

  // Version 1.0
  buf[6] = 1;
  buf[7] = 0;

  // Header length (little-endian uint16)
  buf[8] = headerLen & 0xff;
  buf[9] = (headerLen >> 8) & 0xff;

  // Header string
  for (let i = 0; i < headerLen; i++) {
    buf[preambleLen + i] = headerBytes.charCodeAt(i);
  }

  // Raw data
  buf.set(data, preambleLen + headerLen);

  return buf;
}

/**
 * Compresses data using zlib deflate via the browser's CompressionStream API.
 */
async function deflate(data: Uint8Array): Promise<ArrayBuffer> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  // Kick off the write+close in the background and surface any errors at the
  // end so they don't go unhandled.
  const writePromise = writer.write(data).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  // Surface write/close errors deterministically once the readable side is
  // drained — without this, a rejection would be unhandled.
  await writePromise;

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}
