// MCAP chunk decompression uses Foxglove's wasm-zstd binary, but we
// instantiate it directly so app bundlers do not need package-specific `.wasm`
// loader rules.
import {
  createWasmFrameDecompressor,
  type WasmFrameDecompressor,
} from "./wasm-frame";

const WASM_URL = new URL("./wasm/wasm-zstd.wasm", import.meta.url);

type ZstdWasmExports = {
  readonly c: WebAssembly.Memory;
  readonly d: () => void;
  readonly f: (size: number) => number;
  readonly g: (pointer: number) => void;
  readonly j: (
    destinationPointer: number,
    destinationSize: number,
    sourcePointer: number,
    sourceSize: number
  ) => number;
};

/**
 * Browser zstd frame decompressor used for compressed MCAP chunks.
 */
export type ZstdFrameDecompressor = WasmFrameDecompressor;

let runtimePromise: Promise<ZstdFrameDecompressor> | undefined;

/**
 * Loads and memoizes the zstd WASM runtime for MCAP chunk decompression.
 */
export async function loadZstdFrameDecompressor(): Promise<ZstdFrameDecompressor> {
  runtimePromise ??= createZstdRuntime();

  return runtimePromise;
}

function createZstdRuntime(): Promise<ZstdFrameDecompressor> {
  return createWasmFrameDecompressor<ZstdWasmExports>({
    codecName: "zstd",
    resolveControls: (wasm) => ({
      allocate: wasm.f,
      decompress({
        destinationPointer,
        expectedSize,
        sourcePointer,
        sourceSize,
      }) {
        return wasm.j(
          destinationPointer,
          expectedSize,
          sourcePointer,
          sourceSize
        );
      },
      free: wasm.g,
      initialize: wasm.d,
      memory: wasm.c,
    }),
    wasmUrl: WASM_URL,
  });
}
