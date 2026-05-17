import type { McapTypes } from "@mcap/core";
import "./browser-node-globals";
import decompressLz4 from "@foxglove/wasm-lz4";
import * as zstd from "@foxglove/wasm-zstd";

type DecompressHandlers = McapTypes.DecompressHandlers;
type DecompressHandler = DecompressHandlers[string];

let handlersPromise: Promise<DecompressHandlers> | undefined;

/**
 * Loads the MCAP decompression handlers supported by this adapter.
 *
 * The actual codec runtimes are owned by the Foxglove WASM packages. This
 * wrapper keeps our adapter policy local by loading only the chunk compressions
 * we accept and by validating MCAP sizes before codec packages convert them to
 * numbers.
 */
export async function loadMcapDecompressHandlers(): Promise<DecompressHandlers> {
  if (!handlersPromise) {
    handlersPromise = createMcapDecompressHandlers().catch((error) => {
      handlersPromise = undefined;
      throw error;
    });
  }

  return handlersPromise;
}

async function createMcapDecompressHandlers(): Promise<DecompressHandlers> {
  await Promise.all([decompressLz4.isLoaded, zstd.isLoaded]);

  return {
    lz4: guardedDecompress(
      "LZ4",
      (buffer: Uint8Array, decompressedSize: bigint) =>
        decompressLz4(buffer, Number(decompressedSize))
    ),
    zstd: guardedDecompress(
      "zstd",
      (buffer: Uint8Array, decompressedSize: bigint) =>
        zstd.decompress(buffer, Number(decompressedSize))
    ),
  };
}

function guardedDecompress(
  codecName: string,
  decompress: DecompressHandler
): DecompressHandler {
  return (buffer: Uint8Array, decompressedSize: bigint) => {
    validateDecompressedSize(codecName, decompressedSize);

    return decompress(buffer, decompressedSize);
  };
}

function validateDecompressedSize(codecName: string, decompressedSize: bigint) {
  if (decompressedSize < 0n) {
    throw new Error(
      `MCAP ${codecName} chunk reported a negative decompressed size: ${decompressedSize.toString()} bytes`
    );
  }

  if (decompressedSize > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `MCAP ${codecName} chunk is too large to decompress in the browser: ${decompressedSize.toString()} bytes`
    );
  }
}
