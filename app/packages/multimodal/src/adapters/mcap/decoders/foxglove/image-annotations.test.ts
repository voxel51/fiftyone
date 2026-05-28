import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import { foxgloveImageAnnotationsDecoder } from "./image-annotations";
import { decodeProtobufMessage } from "./protobuf";

vi.mock("./protobuf", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const mockDecode = vi.mocked(decodeProtobufMessage);
const EMPTY_BYTES = new Uint8Array(0);

beforeEach(() => {
  mockDecode.mockReturnValue({ circles: [], points: [], texts: [] });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function color(r: number, g: number, b: number, a: number) {
  return { r, g, b, a };
}

function timestamp(seconds: bigint, nanos: bigint = 0n) {
  return { seconds, nanos };
}

function circle(overrides: Record<string, unknown> = {}) {
  return {
    position: { x: 100, y: 200 },
    diameter: 40,
    thickness: 2,
    outlineColor: color(1, 0, 0, 1),
    fillColor: color(0, 1, 0, 0.5),
    ...overrides,
  };
}

function pointsAnnotation(overrides: Record<string, unknown> = {}) {
  return {
    type: "LINE_STRIP",
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    thickness: 3,
    outlineColor: color(1, 1, 0, 1),
    outlineColors: [],
    fillColor: null,
    ...overrides,
  };
}

function textAnnotation(overrides: Record<string, unknown> = {}) {
  return {
    position: { x: 50, y: 80 },
    text: "label",
    fontSize: 14,
    textColor: color(1, 1, 1, 1),
    backgroundColor: color(0, 0, 0, 0.8),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

describe("foxgloveImageAnnotationsDecoder", () => {
  it("declares the foxglove.ImageAnnotations payload descriptor", () => {
    expect(foxgloveImageAnnotationsDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.ImageAnnotations",
      schemaEncoding: "protobuf",
    });
  });

  // -------------------------------------------------------------------------
  // Circles
  // -------------------------------------------------------------------------

  it("decodes circle position, diameter, thickness, and colors", () => {
    mockDecode.mockReturnValue({
      circles: [circle()],
      points: [],
      texts: [],
    });

    const { visualization } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    expect(visualization?.kind).toBe(VISUALIZATION_KIND.IMAGE_ANNOTATIONS);
    if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;

    const [c] = visualization.circles;
    expect(c.position).toEqual([100, 200]);
    expect(c.diameter).toBe(40);
    expect(c.thickness).toBe(2);
    expect(c.outlineColor).toEqual([1, 0, 0, 1]);
    expect(c.fillColor).toEqual([0, 1, 0, 0.5]);
  });

  it("accepts snake_case color field aliases (outline_color, fill_color)", () => {
    mockDecode.mockReturnValue({
      circles: [
        {
          position: { x: 0, y: 0 },
          diameter: 10,
          thickness: 1,
          outline_color: color(0, 0, 1, 1),
          fill_color: color(1, 0, 0, 0.5),
        },
      ],
      points: [],
      texts: [],
    });

    const { visualization } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;
    expect(visualization.circles[0].outlineColor).toEqual([0, 0, 1, 1]);
    expect(visualization.circles[0].fillColor).toEqual([1, 0, 0, 0.5]);
  });

  it("returns null colors when color fields are absent", () => {
    mockDecode.mockReturnValue({
      circles: [{ position: { x: 0, y: 0 }, diameter: 10, thickness: 1 }],
      points: [],
      texts: [],
    });

    const { visualization } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;
    expect(visualization.circles[0].outlineColor).toBeNull();
    expect(visualization.circles[0].fillColor).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Points — type mapping
  // -------------------------------------------------------------------------

  it("maps the LINE_STRIP string enum to line-strip", () => {
    mockDecode.mockReturnValue({
      circles: [],
      points: [pointsAnnotation({ type: "LINE_STRIP" })],
      texts: [],
    });

    const { visualization } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;
    expect(visualization.points[0].type).toBe("line-strip");
  });

  it("maps the LINE_LOOP string enum to line-loop", () => {
    mockDecode.mockReturnValue({
      circles: [],
      points: [pointsAnnotation({ type: "LINE_LOOP" })],
      texts: [],
    });

    const { visualization } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;
    expect(visualization.points[0].type).toBe("line-loop");
  });

  it("maps numeric enum 1 → points, 2 → line-loop, 3 → line-strip, 4 → line-list", () => {
    for (const [num, expected] of [
      [1, "points"],
      [2, "line-loop"],
      [3, "line-strip"],
      [4, "line-list"],
    ] as const) {
      mockDecode.mockReturnValue({
        circles: [],
        points: [pointsAnnotation({ type: num })],
        texts: [],
      });

      const { visualization } = foxgloveImageAnnotationsDecoder.decode(
        EMPTY_BYTES,
        {}
      );

      if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;
      expect(visualization.points[0].type).toBe(expected);
    }
  });

  it("defaults to points type for unknown type values", () => {
    mockDecode.mockReturnValue({
      circles: [],
      points: [pointsAnnotation({ type: "UNKNOWN_TYPE" })],
      texts: [],
    });

    const { visualization } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;
    expect(visualization.points[0].type).toBe("points");
  });

  it("decodes point coordinates and per-point colors", () => {
    mockDecode.mockReturnValue({
      circles: [],
      points: [
        pointsAnnotation({
          type: "POINTS",
          points: [{ x: 5, y: 10 }, { x: 15, y: 20 }],
          outlineColors: [color(1, 0, 0, 1), color(0, 1, 0, 1)],
        }),
      ],
      texts: [],
    });

    const { visualization } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;
    const p = visualization.points[0];
    expect(p.points).toEqual([[5, 10], [15, 20]]);
    expect(p.outlineColors).toEqual([[1, 0, 0, 1], [0, 1, 0, 1]]);
  });

  // -------------------------------------------------------------------------
  // Texts
  // -------------------------------------------------------------------------

  it("decodes text position, content, fontSize, and colors", () => {
    mockDecode.mockReturnValue({
      circles: [],
      points: [],
      texts: [textAnnotation()],
    });

    const { visualization } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;
    const t = visualization.texts[0];
    expect(t.position).toEqual([50, 80]);
    expect(t.text).toBe("label");
    expect(t.fontSize).toBe(14);
    expect(t.textColor).toEqual([1, 1, 1, 1]);
    expect(t.backgroundColor).toEqual([0, 0, 0, 0.8]);
  });

  it("accepts snake_case font_size alias", () => {
    mockDecode.mockReturnValue({
      circles: [],
      points: [],
      texts: [{ position: { x: 0, y: 0 }, text: "hi", font_size: 20 }],
    });

    const { visualization } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    if (visualization?.kind !== VISUALIZATION_KIND.IMAGE_ANNOTATIONS) return;
    expect(visualization.texts[0].fontSize).toBe(20);
  });

  // -------------------------------------------------------------------------
  // Timestamp precedence (CodeRabbit fix)
  // -------------------------------------------------------------------------

  it("uses the top-level message timestamp when present", () => {
    mockDecode.mockReturnValue({
      timestamp: timestamp(1n, 500000000n),
      circles: [{ ...circle(), timestamp: timestamp(99n) }],
      points: [],
      texts: [],
    });

    const { timing } = foxgloveImageAnnotationsDecoder.decode(EMPTY_BYTES, {});

    // 1s + 0.5s = 1_500_000_000 ns
    expect(timing?.sourceTimestamps?.messageTime).toBe(1_500_000_000n);
  });

  it("falls back to the first annotation timestamp when no top-level timestamp", () => {
    mockDecode.mockReturnValue({
      circles: [{ ...circle(), timestamp: timestamp(2n, 0n) }],
      points: [],
      texts: [],
    });

    const { timing } = foxgloveImageAnnotationsDecoder.decode(EMPTY_BYTES, {});

    expect(timing?.sourceTimestamps?.messageTime).toBe(2_000_000_000n);
  });

  it("produces no messageTime when no timestamps are present", () => {
    const { timing } = foxgloveImageAnnotationsDecoder.decode(EMPTY_BYTES, {});
    expect(timing?.sourceTimestamps?.messageTime).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Attributes
  // -------------------------------------------------------------------------

  it("reports circleCount, pointGroupCount, and textCount as attributes", () => {
    mockDecode.mockReturnValue({
      circles: [circle(), circle()],
      points: [pointsAnnotation()],
      texts: [textAnnotation(), textAnnotation(), textAnnotation()],
    });

    const { attributes } = foxgloveImageAnnotationsDecoder.decode(
      EMPTY_BYTES,
      {}
    );

    expect(attributes).toMatchObject({
      circleCount: 2,
      pointGroupCount: 1,
      textCount: 3,
    });
  });
});
