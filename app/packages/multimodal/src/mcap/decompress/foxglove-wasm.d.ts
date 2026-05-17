declare module "@foxglove/wasm-lz4" {
  interface DecompressLz4 {
    (buffer: Uint8Array, size: number): Uint8Array;
    isLoaded: Promise<unknown>;
  }

  const decompressLz4: DecompressLz4;

  export default decompressLz4;
}

declare module "@foxglove/wasm-zstd" {
  export const isLoaded: Promise<unknown>;
  export function decompress(buffer: Uint8Array, size: number): Uint8Array;
}
