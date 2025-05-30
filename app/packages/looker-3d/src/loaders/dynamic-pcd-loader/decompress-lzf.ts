/**
 * Decompresses LZF-compressed data. This is only relevant for "binary_compressed" mode.
 * This implements the simple LZF algorithm.
 *
 * Reference: https://gitlab.com/taketwo/three-pcd-loader/blob/master/decompress-lzf.js
 *
 * - Literal runs: when ctrl < 32, we copy (ctrl + 1) bytes directly.
 * - Back‑references: when ctrl ≥ 32, the upper 3 bits encode a length code,
 *   the lower 5 bits + next byte form an offset back from the current write
 *   position, and we copy (length + 2) bytes from that offset.
 *
 * @param inData - The LZF-compressed input bytes.
 * @param outLength - The exact length of the decompressed output.
 * @returns A Uint8Array of length `outLength` containing the decompressed bytes.
 */
export const decompressLZF = (
  inData: Uint8Array,
  outLength: number
): Uint8Array => {
  const inLen = inData.length;
  const out = new Uint8Array(outLength);

  let inPtr = 0;
  let outPtr = 0;

  // main loop: continue until we've read all compressed input.
  while (inPtr < inLen) {
    // read the control byte.
    const ctrl = inData[inPtr++];

    if (ctrl < 0x20) {
      // === literal run ===
      // ctrl < 32 means the next (ctrl + 1) bytes are literal data.
      const len = ctrl + 1;
      // copy the next `len` bytes directly from input to output.
      out.set(inData.subarray(inPtr, inPtr + len), outPtr);
      inPtr += len; // advance input pointer past the literals
      outPtr += len; // advance output pointer by the same count
    } else {
      // === back‑reference run ===
      // The top 3 bits of ctrl form a base length code.
      // ctrl >> 5 yields a value 1..7
      let len = ctrl >> 5;
      // the high bits of the backward offset; we subtract from outPtr.
      let ref = outPtr - ((ctrl & 0x1f) << 8) - 1;

      // if len === 7, an extra length byte follows, extending the run.
      if (len === 7) {
        // read extra length and add
        len += inData[inPtr++];
      }

      // read the low 8 bits of the offset and subtract to get final ref.
      ref -= inData[inPtr++];
      // copy (len + 2) bytes from the computed back‑reference location.
      // the +2 is part of the LZF spec: minimum copy is 2 bytes.
      const copyCount = len + 2;
      for (let i = 0; i < copyCount; i++) {
        out[outPtr++] = out[ref++];
      }
    }
  }

  return out;
};
