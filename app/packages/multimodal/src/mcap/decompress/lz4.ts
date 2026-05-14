// MCAP chunk decompression uses the tiny Foxglove LZ4 frame WASM binary, but
// we instantiate it directly so app bundlers do not need package-specific
// `.wasm` loader rules.
import {
  createWasmFrameDecompressor,
  type WasmFrameDecompressor,
} from "./wasm-frame";

const WASM_URL = new URL("./wasm/wasm-lz4.wasm", import.meta.url);

type Lz4WasmExports = {
  readonly c: WebAssembly.Memory;
  readonly d: () => void;
  readonly e: (size: number) => number;
  readonly f: (pointer: number) => void;
  readonly h: (
    context: number,
    destinationPointer: number,
    destinationSize: number,
    sourcePointer: number,
    sourceSize: number
  ) => number;
  readonly i: () => number;
};

/**
 * Browser LZ4 frame decompressor used for compressed MCAP chunks.
 */
export type Lz4FrameDecompressor = WasmFrameDecompressor;

let runtimePromise: Promise<Lz4FrameDecompressor> | undefined;

/**
 * Loads and memoizes the LZ4 WASM runtime for MCAP chunk decompression.
 */
export async function loadLz4FrameDecompressor(): Promise<Lz4FrameDecompressor> {
  if (!runtimePromise) {
    runtimePromise = createLz4Runtime().catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }

  return runtimePromise;
}

function createLz4Runtime(): Promise<Lz4FrameDecompressor> {
  return createWasmFrameDecompressor<Lz4WasmExports>({
    codecName: "LZ4",
    resolveControls(wasm) {
      let context = 0;

      return {
        allocate: wasm.e,
        decompress({
          destinationPointer,
          expectedSize,
          sourcePointer,
          sourceSize,
        }) {
          context ||= wasm.i();
          return wasm.h(
            context,
            destinationPointer,
            expectedSize,
            sourcePointer,
            sourceSize
          );
        },
        free: wasm.f,
        initialize: wasm.d,
        memory: wasm.c,
      };
    },
    wasmUrl: WASM_URL,
  });
}
