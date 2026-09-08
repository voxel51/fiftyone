import { describe, expect, it } from "vitest";

import { releaseArrayBuffers } from "./release-array-buffers";

describe("releaseArrayBuffers", () => {
  it("detaches unique backing stores synchronously", () => {
    const first = new ArrayBuffer(16);
    const second = new ArrayBuffer(32);

    expect(releaseArrayBuffers([first, second, first])).toBe(48);
    expect(first.byteLength).toBe(0);
    expect(second.byteLength).toBe(0);
  });

  it("ignores already-detached and empty inputs", () => {
    const buffer = new ArrayBuffer(8);
    structuredClone(null, { transfer: [buffer] });

    expect(releaseArrayBuffers([buffer])).toBe(0);
    expect(releaseArrayBuffers([])).toBe(0);
  });
});
