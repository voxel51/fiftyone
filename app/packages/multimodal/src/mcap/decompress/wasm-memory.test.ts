import { describe, expect, it, vi } from "vitest";
import { growWasmMemory } from "./wasm-memory";

describe("WASM memory growth", () => {
  it("rejects invalid requested sizes without wrapping them", () => {
    for (const requestedSize of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2_147_483_649,
      4_294_967_297,
    ]) {
      const memory = { grow: vi.fn() } as unknown as WebAssembly.Memory;

      expect(
        growWasmMemory({
          heap: new Uint8Array(),
          memory,
          requestedSize,
          updateHeap: vi.fn(),
        })
      ).toBe(0);
      expect(memory.grow).not.toHaveBeenCalled();
    }
  });
});
