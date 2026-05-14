const MAX_WASM_HEAP_BYTES = 2_147_483_648;

/**
 * Grows a decoder WASM heap enough to satisfy an allocation request.
 */
export function growWasmMemory({
  heap,
  memory,
  requestedSize,
  updateHeap,
}: {
  readonly heap: Uint8Array;
  readonly memory: WebAssembly.Memory | undefined;
  readonly requestedSize: number;
  readonly updateHeap: (memory: WebAssembly.Memory) => void;
}) {
  if (!memory) {
    return 0;
  }

  const oldSize = heap.byteLength;
  if (
    !Number.isFinite(requestedSize) ||
    requestedSize < 0 ||
    !Number.isInteger(requestedSize)
  ) {
    return 0;
  }

  const normalizedSize = requestedSize;
  if (normalizedSize > MAX_WASM_HEAP_BYTES) {
    return 0;
  }

  for (let attempt = 1; attempt <= 4; attempt *= 2) {
    const overGrownHeapSize = Math.min(
      oldSize * (1 + 0.2 / attempt),
      normalizedSize + 100_663_296
    );
    const newSize = Math.min(
      MAX_WASM_HEAP_BYTES,
      alignToPage(Math.max(normalizedSize, overGrownHeapSize))
    );

    try {
      memory.grow((newSize - oldSize + 65_535) >>> 16);
      updateHeap(memory);

      return 1;
    } catch {
      // Try a smaller overgrowth factor before reporting allocation failure.
    }
  }

  return 0;
}

function alignToPage(value: number) {
  return value + ((65_536 - (value % 65_536)) % 65_536);
}
