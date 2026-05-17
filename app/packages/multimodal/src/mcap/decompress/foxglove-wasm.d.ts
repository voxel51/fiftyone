declare module "@foxglove/wasm-lz4" {
  interface DecompressLz4 {
    (buffer: Uint8Array, size: number): Uint8Array;
    isLoaded: Promise<unknown>;
  }

  const decompressLz4: DecompressLz4;

  export default decompressLz4;
}

declare module "@foxglove/wasm-zstd" {
  /**
   * Resolves when the zstd WASM module is ready to decompress chunks.
   */
  export const isLoaded: Promise<unknown>;

  /**
   * Decompresses one zstd-compressed chunk into the expected output size.
   */
  export function decompress(buffer: Uint8Array, size: number): Uint8Array;
}
