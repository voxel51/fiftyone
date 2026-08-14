/**
 * Decode-path tests for the fetch functions: buffer layouts, header
 * flags, and dtype discrimination, against canned binary responses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: () => fetchMock,
}));

import {
  DTYPE_BITMASK,
  DTYPE_F32,
  DTYPE_U16,
  FLAG_ALL_MATCH,
  FLAG_ALL_VISIBLE,
  HEADER_BYTES,
  MAGIC,
  fetchColor,
  fetchGeometry,
  fetchMasks,
} from "./protocol";

const makeColumn = (
  dtype: number,
  width: number,
  n: number,
  payload: Uint8Array,
  flags = 0,
): ArrayBuffer => {
  const buffer = new ArrayBuffer(HEADER_BYTES + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, 1, true);
  view.setUint8(6, dtype);
  view.setUint8(7, width);
  view.setUint32(8, n, true);
  view.setUint32(12, flags, true);
  new Uint8Array(buffer, HEADER_BYTES).set(payload);
  return buffer;
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe("fetchGeometry", () => {
  it("splits planar columns into per-axis views", async () => {
    const payload = new Uint8Array(2 * 4 * 3);
    new Float32Array(payload.buffer).set([1, 2, 3, 10, 20, 30]);
    fetchMock.mockResolvedValue(makeColumn(DTYPE_F32, 2, 3, payload));

    const geometry = await fetchGeometry("d", "k");
    expect(geometry.n).toBe(3);
    expect(Array.from(geometry.columns[0])).toEqual([1, 2, 3]);
    expect(Array.from(geometry.columns[1])).toEqual([10, 20, 30]);
  });

  it("rejects a non-f32 response", async () => {
    fetchMock.mockResolvedValue(makeColumn(DTYPE_U16, 1, 1, new Uint8Array(2)));
    await expect(fetchGeometry("d", "k")).rejects.toThrow(/f32/);
  });
});

describe("fetchMasks", () => {
  it("unpacks both masks from their offsets", async () => {
    // n=10 -> 2 bytes per mask. visible: bits 0,1 set; match: bit 9 set
    const payload = new Uint8Array([0b0000_0011, 0, 0, 0b0000_0010]);
    fetchMock.mockResolvedValue(makeColumn(DTYPE_BITMASK, 2, 10, payload));

    const masks = await fetchMasks("d", "k", [], null);
    const { visible, match } = masks;
    if (!visible || !match) throw new Error("expected both masks");
    expect(Array.from(visible)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(match)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("returns null columns for the early-out flags", async () => {
    fetchMock.mockResolvedValue(
      makeColumn(
        DTYPE_BITMASK,
        2,
        10,
        new Uint8Array(4),
        FLAG_ALL_VISIBLE | FLAG_ALL_MATCH,
      ),
    );

    const masks = await fetchMasks("d", "k", [], null);
    expect(masks.visible).toBeNull();
    expect(masks.match).toBeNull();
  });
});

/** Column bytes + a JSON tail, as /v2/color responds */
const withTail = (column: Uint8Array, meta: object): Uint8Array => {
  const tail = new TextEncoder().encode(JSON.stringify(meta));
  const combined = new Uint8Array(column.byteLength + tail.byteLength);
  combined.set(column);
  combined.set(tail, column.byteLength);
  return combined;
};

describe("fetchColor", () => {
  it("splits a categorical response at the header-determined boundary", async () => {
    const column = new Uint8Array(6);
    new Uint16Array(column.buffer).set([0, 2, 0xffff]);
    const meta = {
      style: "categorical",
      classes: [{ label: "cat", count: 2 }],
      truncated: false,
    };
    fetchMock.mockResolvedValue(
      makeColumn(DTYPE_U16, 1, 3, withTail(column, meta)),
    );

    const response = await fetchColor("d", "k", "f");
    expect(response.values.style).toBe("categorical");
    if (response.values.style === "categorical") {
      expect(Array.from(response.values.indices)).toEqual([0, 2, 0xffff]);
    }
    expect(response.meta).toEqual(meta);
  });

  it("splits a continuous response and its min/max tail", async () => {
    const column = new Uint8Array(8);
    new Float32Array(column.buffer).set([0.5, 2.5]);
    fetchMock.mockResolvedValue(
      makeColumn(
        DTYPE_F32,
        1,
        2,
        withTail(column, { style: "continuous", min: 0.5, max: 2.5 }),
      ),
    );

    const response = await fetchColor("d", "k", "f");
    expect(response.values.style).toBe("continuous");
    if (response.values.style === "continuous") {
      expect(Array.from(response.values.values)).toEqual([0.5, 2.5]);
    }
    expect(response.meta.min).toBe(0.5);
    expect(response.meta.max).toBe(2.5);
  });
});
