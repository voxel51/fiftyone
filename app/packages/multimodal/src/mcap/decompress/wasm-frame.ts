import { growWasmMemory } from "./wasm-memory";

/**
 * Decompresses one compressed MCAP chunk frame using a browser WASM runtime.
 */
export type WasmFrameDecompressor = (
  buffer: Uint8Array,
  decompressedSize: bigint
) => Uint8Array;

type WasmFrameControls = {
  readonly allocate: (size: number) => number;
  readonly decompress: (request: WasmFrameDecompressRequest) => number;
  readonly free: (pointer: number) => void;
  readonly initialize: () => void;
  readonly memory: WebAssembly.Memory;
};

type WasmFrameDecompressRequest = {
  readonly destinationPointer: number;
  readonly expectedSize: number;
  readonly sourcePointer: number;
  readonly sourceSize: number;
};

/**
 * Instantiates a WASM frame decoder and wraps its allocation/decompression ABI.
 */
export async function createWasmFrameDecompressor<WasmExports>({
  codecName,
  resolveControls,
  wasmUrl,
}: {
  readonly codecName: string;
  readonly resolveControls: (wasm: WasmExports) => WasmFrameControls;
  readonly wasmUrl: URL;
}): Promise<WasmFrameDecompressor> {
  let memory: WebAssembly.Memory | undefined;
  let heap = new Uint8Array();

  const updateHeap = (nextMemory: WebAssembly.Memory) => {
    memory = nextMemory;
    heap = new Uint8Array(nextMemory.buffer);
  };

  const imports = {
    a: {
      a: (requestedSize: number) =>
        growWasmMemory({
          heap,
          memory,
          requestedSize,
          updateHeap,
        }),
      b: (destination: number, source: number, length: number) => {
        heap.copyWithin(destination, source, source + length);
      },
    },
  };

  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to load MCAP ${codecName} WASM asset: ${response.status}`
    );
  }

  const wasmBytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
  const controls = resolveControls(instance.exports as WasmExports);
  updateHeap(controls.memory);
  controls.initialize();

  return (buffer, decompressedSize) => {
    if (decompressedSize > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        `MCAP ${codecName} chunk is too large to decompress in the browser: ${decompressedSize.toString()} bytes`
      );
    }

    const expectedSize = Number(decompressedSize);
    if (expectedSize === 0) {
      return new Uint8Array();
    }

    const sourcePointer = controls.allocate(buffer.byteLength);
    if (!sourcePointer) {
      throw new Error(`MCAP ${codecName} WASM allocation failed`);
    }

    let destinationPointer = 0;
    try {
      destinationPointer = controls.allocate(expectedSize);
      if (!destinationPointer) {
        throw new Error(`MCAP ${codecName} WASM allocation failed`);
      }

      heap.set(buffer, sourcePointer);

      const resultSize = controls.decompress({
        destinationPointer,
        expectedSize,
        sourcePointer,
        sourceSize: buffer.byteLength,
      });

      if (resultSize < 0) {
        throw new Error(`MCAP ${codecName} decompression failed`);
      }

      if (resultSize !== expectedSize) {
        throw new Error(
          `MCAP ${codecName} decompressed length mismatch: expected ${expectedSize}, received ${resultSize}`
        );
      }

      return heap.slice(destinationPointer, destinationPointer + resultSize);
    } finally {
      controls.free(sourcePointer);
      if (destinationPointer) {
        controls.free(destinationPointer);
      }
    }
  };
}
