import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import { foxgloveGridDecoder } from "./grid";
import { decodeProtobufMessage } from "./protobuf";

vi.mock("./protobuf", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const UINT8_TYPE = 1;
const FLOAT32_TYPE = 7;
const mockDecode = vi.mocked(decodeProtobufMessage);

beforeEach(() => {
  mockDecode.mockReset();
});

describe("foxgloveGridDecoder", () => {
  it("declares the foxglove.Grid payload descriptor", () => {
    expect(foxgloveGridDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.Grid",
      schemaEncoding: "protobuf",
    });
  });

  it("swizzles NuScenes-style A/B/G/R fields into RGBA and derives rows", () => {
    // 3 columns x 2 rows, 4-byte cells packed alpha,blue,green,red (the
    // actual NuScenes /map layout), row stride padded by 2 bytes.
    const rowStride = 14;
    const data = new Uint8Array(rowStride * 2);
    writeCell(data, 0, 0, rowStride, [10, 20, 30, 40]);
    writeCell(data, 0, 1, rowStride, [50, 60, 70, 80]);
    writeCell(data, 0, 2, rowStride, [90, 100, 110, 120]);
    writeCell(data, 1, 0, rowStride, [11, 21, 31, 41]);
    writeCell(data, 1, 1, rowStride, [51, 61, 71, 81]);
    writeCell(data, 1, 2, rowStride, [91, 101, 111, 121]);
    mockDecode.mockReturnValue(
      gridMessage({
        data,
        fields: [
          { name: "alpha", offset: 0, type: UINT8_TYPE },
          { name: "blue", offset: 1, type: UINT8_TYPE },
          { name: "green", offset: 2, type: UINT8_TYPE },
          { name: "red", offset: 3, type: UINT8_TYPE },
        ],
        rowStride,
      }),
    );

    const { attributes, resourceHints, timing, visualization } =
      foxgloveGridDecoder.decode(EMPTY_BYTES, {});

    expect(visualization?.kind).toBe(VISUALIZATION_KIND.GRID);
    if (visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(visualization.columnCount).toBe(3);
    expect(visualization.rowCount).toBe(2);
    expect(visualization.cellSize).toEqual([0.5, 0.25]);
    expect(visualization.coordinateFrameId).toBe("map");
    expect(visualization.pose).toEqual({
      position: [920, 1300.5, 0],
      quaternion: [0, 0, 0.5, 0.75],
    });
    expect(visualization.timestampNs).toBe(12_000_000_034n);
    // Cell bytes are a,b,g,r; output is r,g,b,a.
    expect(Array.from(visualization.rgba.slice(0, 12))).toEqual([
      40, 30, 20, 10, 80, 70, 60, 50, 120, 110, 100, 90,
    ]);
    expect(Array.from(visualization.rgba.slice(12, 24))).toEqual([
      41, 31, 21, 11, 81, 71, 61, 51, 121, 111, 101, 91,
    ]);

    expect(attributes).toMatchObject({
      cellStride: 4,
      colorMode: "color",
      columnCount: 3,
      frameId: "map",
      rowCount: 2,
      rowStride,
    });
    expect(resourceHints?.transferables).toContain(visualization.rgba.buffer);
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("defaults alpha to opaque when color fields omit it", () => {
    const data = Uint8Array.of(1, 2, 3);
    mockDecode.mockReturnValue(
      gridMessage({
        cellStride: 3,
        columnCount: 1,
        data,
        fields: [
          { name: "r", offset: 0, type: UINT8_TYPE },
          { name: "g", offset: 1, type: UINT8_TYPE },
          { name: "b", offset: 2, type: UINT8_TYPE },
        ],
        rowStride: 3,
      }),
    );

    const { visualization } = foxgloveGridDecoder.decode(EMPTY_BYTES, {});
    if (visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(Array.from(visualization.rgba)).toEqual([1, 2, 3, 255]);
  });

  it("maps single scalar fields to a value-normalized translucent mask", () => {
    // NuScenes /drivable_area publishes {0, 1} values: normalization by the
    // per-message max is what keeps the mask visible at all.
    const data = Uint8Array.of(0, 1, 1, 0);
    mockDecode.mockReturnValue(
      gridMessage({
        cellStride: 1,
        columnCount: 2,
        data,
        fields: [{ name: "drivable_area", offset: 0, type: UINT8_TYPE }],
        rowStride: 2,
      }),
    );

    const { attributes, visualization } = foxgloveGridDecoder.decode(
      EMPTY_BYTES,
      {},
    );
    if (visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(attributes?.colorMode).toBe("scalar");
    expect(Array.from(visualization.rgba)).toEqual([
      255, 255, 255, 0, 255, 255, 255, 153, 255, 255, 255, 153, 255, 255, 255,
      0,
    ]);
  });

  it("normalizes scalar values against the per-message maximum", () => {
    const data = Uint8Array.of(0, 2, 4);
    mockDecode.mockReturnValue(
      gridMessage({
        cellStride: 1,
        columnCount: 3,
        data,
        fields: [{ name: "occupancy", offset: 0, type: UINT8_TYPE }],
        rowStride: 3,
      }),
    );

    const { visualization } = foxgloveGridDecoder.decode(EMPTY_BYTES, {});
    if (visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(Array.from(visualization.rgba)).toEqual([
      255, 255, 255, 0, 255, 255, 255, 77, 255, 255, 255, 153,
    ]);
  });

  it("emits a fully transparent mask for all-zero scalar grids", () => {
    mockDecode.mockReturnValue(
      gridMessage({
        cellStride: 1,
        columnCount: 2,
        data: new Uint8Array(2),
        fields: [{ name: "occupancy", offset: 0, type: UINT8_TYPE }],
        rowStride: 2,
      }),
    );

    const { visualization } = foxgloveGridDecoder.decode(EMPTY_BYTES, {});
    if (visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(Array.from(visualization.rgba)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("tolerates zero-padded tails but rejects partial rows with data", () => {
    const padded = gridMessage({
      cellStride: 1,
      columnCount: 2,
      data: Uint8Array.of(1, 2, 0),
      fields: [{ name: "occupancy", offset: 0, type: UINT8_TYPE }],
      rowStride: 2,
    });
    mockDecode.mockReturnValue(padded);
    const { visualization } = foxgloveGridDecoder.decode(EMPTY_BYTES, {});
    if (visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(visualization.rowCount).toBe(1);

    mockDecode.mockReturnValue({
      ...padded,
      data: Uint8Array.of(1, 2, 3),
    });
    expect(() => foxgloveGridDecoder.decode(EMPTY_BYTES, {})).toThrow(
      "Grid data length is not aligned to row stride",
    );
  });

  it("rejects field layouts it cannot normalize", () => {
    const base = {
      cellStride: 2,
      columnCount: 1,
      data: Uint8Array.of(1, 2),
      rowStride: 2,
    };

    mockDecode.mockReturnValue(
      gridMessage({
        ...base,
        fields: [
          { name: "foo", offset: 0, type: UINT8_TYPE },
          { name: "bar", offset: 1, type: UINT8_TYPE },
        ],
      }),
    );
    expect(() => foxgloveGridDecoder.decode(EMPTY_BYTES, {})).toThrow(
      "Grid has unsupported fields [foo, bar]",
    );

    mockDecode.mockReturnValue(
      gridMessage({
        ...base,
        cellStride: 4,
        data: new Uint8Array(4),
        fields: [{ name: "height", offset: 0, type: FLOAT32_TYPE }],
        rowStride: 4,
      }),
    );
    expect(() => foxgloveGridDecoder.decode(EMPTY_BYTES, {})).toThrow(
      "Grid has unsupported fields [height]",
    );
  });

  it("rejects degenerate grid geometry", () => {
    const valid = gridMessage({
      cellStride: 1,
      columnCount: 2,
      data: Uint8Array.of(1, 2),
      fields: [{ name: "occupancy", offset: 0, type: UINT8_TYPE }],
      rowStride: 2,
    });

    mockDecode.mockReturnValue({ ...valid, columnCount: 0 });
    expect(() => foxgloveGridDecoder.decode(EMPTY_BYTES, {})).toThrow(
      "Invalid grid column count 0",
    );

    mockDecode.mockReturnValue({ ...valid, rowStride: 1 });
    expect(() => foxgloveGridDecoder.decode(EMPTY_BYTES, {})).toThrow(
      "Grid row stride 1 cannot hold 2 cells of stride 1",
    );

    mockDecode.mockReturnValue({ ...valid, cellSize: { x: 0, y: 0.1 } });
    expect(() => foxgloveGridDecoder.decode(EMPTY_BYTES, {})).toThrow(
      "Invalid grid cell size 0x0.1",
    );

    mockDecode.mockReturnValue({ ...valid, data: new Uint8Array(1) });
    expect(() => foxgloveGridDecoder.decode(EMPTY_BYTES, {})).toThrow(
      "Grid data holds no complete rows",
    );
  });
});

interface TestGridField {
  readonly name: string;
  readonly offset: number;
  readonly type: number;
}

function gridMessage({
  cellStride = 4,
  columnCount = 3,
  data,
  fields,
  rowStride,
}: {
  readonly cellStride?: number;
  readonly columnCount?: number;
  readonly data: Uint8Array;
  readonly fields: readonly TestGridField[];
  readonly rowStride: number;
}): Record<string, unknown> {
  return {
    cellSize: { x: 0.5, y: 0.25 },
    cellStride,
    columnCount,
    data,
    fields,
    frameId: "map",
    pose: {
      orientation: { x: 0, y: 0, z: 0.5, w: 0.75 },
      position: { x: 920, y: 1300.5, z: 0 },
    },
    rowStride,
    timestamp: { nanos: 34n, seconds: 12n },
  };
}

function writeCell(
  data: Uint8Array,
  row: number,
  column: number,
  rowStride: number,
  abgr: readonly [number, number, number, number],
) {
  data.set(abgr, row * rowStride + column * 4);
}
