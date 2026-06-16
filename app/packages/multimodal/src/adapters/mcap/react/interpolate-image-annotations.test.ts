import { describe, expect, it } from "vitest";

import type {
  ImageAnnotationCircle,
  ImageAnnotationPoints,
  ImageAnnotationText,
  ImageAnnotationsVisualization,
} from "../../../decoders";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapDecodedMessage } from "../types";
import {
  aabbIoU,
  chamferDistance,
  interpolateCircles,
  interpolateImageAnnotations,
  interpolateLineList,
  interpolatePointsArray,
  interpolateTexts,
  interpolationFraction,
  lowerBoundBigInt,
  makeGroup,
  matchLineListGroups,
  vizOf,
  type Point2,
} from "./interpolate-image-annotations";

// ---------------------------------------------------------------------------
// Fixture builders (typed so array literals infer as the readonly tuples the
// decoder types require, rather than number[]).
// ---------------------------------------------------------------------------

function circle(
  position: readonly [number, number],
  diameter: number
): ImageAnnotationCircle {
  return {
    position,
    diameter,
    thickness: 1,
    outlineColor: null,
    fillColor: null,
  };
}

function text(
  t: string,
  position: readonly [number, number]
): ImageAnnotationText {
  return {
    position,
    text: t,
    fontSize: 12,
    textColor: null,
    backgroundColor: null,
  };
}

function pointsPrim(
  type: ImageAnnotationPoints["type"],
  points: readonly (readonly [number, number])[]
): ImageAnnotationPoints {
  return {
    type,
    points,
    thickness: 1,
    outlineColor: null,
    outlineColors: [],
    fillColor: null,
  };
}

function lineList(
  points: readonly (readonly [number, number])[]
): ImageAnnotationPoints {
  return pointsPrim("line-list", points);
}

function viz(
  parts: Partial<
    Pick<ImageAnnotationsVisualization, "circles" | "points" | "texts">
  > = {}
): ImageAnnotationsVisualization {
  return {
    kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS,
    circles: [],
    points: [],
    texts: [],
    ...parts,
  };
}

function seg(a: Point2, b: Point2): [Point2, Point2] {
  return [a, b];
}

/** The four edge segments of an axis-aligned rectangle, counter-clockwise. */
function boxSegments(
  x: number,
  y: number,
  w: number,
  h: number
): [Point2, Point2][] {
  const bl: Point2 = [x, y];
  const br: Point2 = [x + w, y];
  const tr: Point2 = [x + w, y + h];
  const tl: Point2 = [x, y + h];
  return [seg(bl, br), seg(br, tr), seg(tr, tl), seg(tl, bl)];
}

/** Flattened line-list point pairs for an axis-aligned rectangle. */
function boxPoints(x: number, y: number, w: number, h: number): Point2[] {
  return boxSegments(x, y, w, h).flatMap(([a, b]) => [a, b]);
}

const ns = (n: number) => BigInt(n);

// ---------------------------------------------------------------------------

describe("interpolationFraction", () => {
  it("returns the linear fraction between prev and next", () => {
    expect(
      interpolationFraction({
        previousTimelineTimeNs: ns(0),
        nextTimelineTimeNs: ns(100),
        playheadNs: ns(50),
      })
    ).toBe(0.5);
    expect(
      interpolationFraction({
        previousTimelineTimeNs: ns(0),
        nextTimelineTimeNs: ns(100),
        playheadNs: ns(25),
      })
    ).toBe(0.25);
  });

  it("clamps to 1 when the playhead is past the next message", () => {
    expect(
      interpolationFraction({
        previousTimelineTimeNs: ns(0),
        nextTimelineTimeNs: ns(100),
        playheadNs: ns(250),
      })
    ).toBe(1);
  });

  it("returns null when the span is non-positive (equal or out-of-order)", () => {
    expect(
      interpolationFraction({
        previousTimelineTimeNs: ns(100),
        nextTimelineTimeNs: ns(100),
        playheadNs: ns(150),
      })
    ).toBeNull();
    expect(
      interpolationFraction({
        previousTimelineTimeNs: ns(100),
        nextTimelineTimeNs: ns(50),
        playheadNs: ns(120),
      })
    ).toBeNull();
  });

  it("returns null when the playhead is at or before prev (elapsed <= 0)", () => {
    expect(
      interpolationFraction({
        previousTimelineTimeNs: ns(100),
        nextTimelineTimeNs: ns(200),
        playheadNs: ns(100),
      })
    ).toBeNull();
    expect(
      interpolationFraction({
        previousTimelineTimeNs: ns(100),
        nextTimelineTimeNs: ns(200),
        playheadNs: ns(50),
      })
    ).toBeNull();
  });
});

describe("vizOf", () => {
  const msgWith = (visualization: unknown): McapDecodedMessage =>
    ({
      decoded: { output: { visualization } },
    } as unknown as McapDecodedMessage);

  it("returns the visualization when it is an image-annotations kind", () => {
    const v = viz({ circles: [circle([1, 2], 4)] });
    expect(vizOf(msgWith(v))).toBe(v);
  });

  it("returns null when there is no visualization", () => {
    expect(vizOf(msgWith(null))).toBeNull();
    expect(vizOf(msgWith(undefined))).toBeNull();
  });

  it("returns null for a non-image-annotations visualization", () => {
    expect(
      vizOf(msgWith({ kind: VISUALIZATION_KIND.ENCODED_IMAGE }))
    ).toBeNull();
  });
});

describe("lowerBoundBigInt", () => {
  const ticks = [ns(10), ns(20), ns(30), ns(40)];

  it("returns the index of an exact match", () => {
    expect(lowerBoundBigInt(ticks, ns(20))).toBe(1);
    expect(lowerBoundBigInt(ticks, ns(10))).toBe(0);
    expect(lowerBoundBigInt(ticks, ns(40))).toBe(3);
  });

  it("returns the insertion index for a value between ticks", () => {
    expect(lowerBoundBigInt(ticks, ns(25))).toBe(2);
  });

  it("returns 0 before all and length after all", () => {
    expect(lowerBoundBigInt(ticks, ns(5))).toBe(0);
    expect(lowerBoundBigInt(ticks, ns(50))).toBe(4);
  });

  it("returns 0 for an empty array", () => {
    expect(lowerBoundBigInt([], ns(5))).toBe(0);
  });
});

describe("aabbIoU", () => {
  it("is 1 for identical boxes", () => {
    expect(
      aabbIoU(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 0, minY: 0, maxX: 10, maxY: 10 }
      )
    ).toBe(1);
  });

  it("is 0 for disjoint or edge-touching boxes", () => {
    expect(
      aabbIoU(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 20, minY: 20, maxX: 30, maxY: 30 }
      )
    ).toBe(0);
    // shares only the x=10 edge -> no positive-area intersection
    expect(
      aabbIoU(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 10, minY: 0, maxX: 20, maxY: 10 }
      )
    ).toBe(0);
  });

  it("computes the intersection-over-union for partial overlap", () => {
    // inter = 5x5 = 25, union = 100 + 100 - 25 = 175
    expect(
      aabbIoU(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 5, minY: 5, maxX: 15, maxY: 15 }
      )
    ).toBeCloseTo(25 / 175, 6);
  });

  it("is 0 for a degenerate zero-area box", () => {
    expect(
      aabbIoU(
        { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        { minX: 0, minY: 0, maxX: 0, maxY: 0 }
      )
    ).toBe(0);
  });
});

describe("chamferDistance", () => {
  it("is Infinity when either set is empty", () => {
    expect(chamferDistance([], [[0, 0]])).toBe(Infinity);
    expect(chamferDistance([[0, 0]], [])).toBe(Infinity);
  });

  it("is 0 for identical point sets", () => {
    expect(
      chamferDistance(
        [
          [0, 0],
          [10, 0],
        ],
        [
          [0, 0],
          [10, 0],
        ]
      )
    ).toBe(0);
  });

  it("is the symmetric mean nearest-neighbour distance", () => {
    // single points 3-4-5 triangle apart -> distance 5 each way
    expect(chamferDistance([[0, 0]], [[3, 4]])).toBeCloseTo(5, 6);
  });
});

describe("interpolateCircles", () => {
  it("returns prev unchanged when counts differ", () => {
    const prev = [circle([0, 0], 10)];
    expect(interpolateCircles(prev, [], 0.5)).toBe(prev);
  });

  it("lerps position and diameter at f, preserving other fields", () => {
    const prev = [circle([0, 0], 10)];
    const next = [circle([10, 20], 20)];
    const out = interpolateCircles(prev, next, 0.5);
    expect(out[0].position).toEqual([5, 10]);
    expect(out[0].diameter).toBe(15);
    expect(out[0].thickness).toBe(1);
  });

  it("equals prev at f=0 and next at f=1", () => {
    const prev = [circle([0, 0], 10)];
    const next = [circle([10, 20], 20)];
    expect(interpolateCircles(prev, next, 0)[0].position).toEqual([0, 0]);
    expect(interpolateCircles(prev, next, 0)[0].diameter).toBe(10);
    expect(interpolateCircles(prev, next, 1)[0].position).toEqual([10, 20]);
    expect(interpolateCircles(prev, next, 1)[0].diameter).toBe(20);
  });
});

describe("interpolateTexts", () => {
  it("lerps the position of a same-text match within distance", () => {
    const out = interpolateTexts(
      [text("car", [0, 0])],
      [text("car", [10, 10])],
      0.5
    );
    expect(out[0].position).toEqual([5, 5]);
    expect(out[0].text).toBe("car");
  });

  it("keeps prev unchanged when the text content differs", () => {
    const out = interpolateTexts(
      [text("car", [0, 0])],
      [text("truck", [0, 0])],
      0.5
    );
    expect(out[0].position).toEqual([0, 0]);
  });

  it("keeps prev unchanged when the nearest same-text match is beyond MATCH_DISTANCE_PX", () => {
    const out = interpolateTexts(
      [text("car", [0, 0])],
      [text("car", [300, 0])],
      0.5
    );
    expect(out[0].position).toEqual([0, 0]);
  });

  it("matches greedily: a claimed next forces a later prev to a farther one", () => {
    // Both prevs are nearest to next0=[5,0]; greedy gives next0 to the first
    // prev, forcing the second to next1. A naive per-prev nearest match would
    // (wrongly) send BOTH to next0 -> out[1] would be [5,0], not [200,0].
    const prev = [text("car", [0, 0]), text("car", [6, 0])];
    const next = [text("car", [5, 0]), text("car", [200, 0])];
    const out = interpolateTexts(prev, next, 1);
    expect(out[0].position).toEqual([5, 0]);
    expect(out[1].position).toEqual([200, 0]);
  });
});

describe("interpolatePointsArray", () => {
  it("returns prev.points when the primitive counts differ", () => {
    const prev = viz({ points: [pointsPrim("points", [[0, 0]])] });
    const next = viz({
      points: [pointsPrim("points", [[0, 0]]), pointsPrim("points", [[1, 1]])],
    });
    expect(interpolatePointsArray(prev, next, 0.5)).toBe(prev.points);
  });

  it("keeps a primitive as prev when its type changes between frames", () => {
    const prev = viz({ points: [pointsPrim("points", [[0, 0]])] });
    const next = viz({
      points: [
        lineList([
          [0, 0],
          [1, 1],
        ]),
      ],
    });
    expect(interpolatePointsArray(prev, next, 0.5)[0]).toBe(prev.points[0]);
  });

  it("index-lerps a non-line-list primitive of equal length", () => {
    const prev = viz({
      points: [
        pointsPrim("points", [
          [0, 0],
          [10, 10],
        ]),
      ],
    });
    const next = viz({
      points: [
        pointsPrim("points", [
          [10, 10],
          [20, 20],
        ]),
      ],
    });
    const out = interpolatePointsArray(prev, next, 0.5)[0];
    expect(out.points).toEqual([
      [5, 5],
      [15, 15],
    ]);
  });

  it("keeps a non-line-list primitive as prev when point counts differ", () => {
    const prev = viz({ points: [pointsPrim("points", [[0, 0]])] });
    const next = viz({
      points: [
        pointsPrim("points", [
          [0, 0],
          [1, 1],
        ]),
      ],
    });
    expect(interpolatePointsArray(prev, next, 0.5)[0]).toBe(prev.points[0]);
  });
});

describe("interpolateLineList", () => {
  it("lerps endpoints of a matched, same-label box", () => {
    const prev = lineList(boxPoints(0, 0, 10, 10));
    const next = lineList(boxPoints(5, 0, 10, 10)); // overlaps prev (IoU ~0.33)
    const out = interpolateLineList(
      prev,
      next,
      [text("car", [5, 5])],
      [text("car", [10, 5])],
      0.5
    );
    expect(out.type).toBe("line-list");
    expect(out.points).toHaveLength(8);
    // first segment start: (0,0)->(5,0) at f=0.5 -> (2.5,0); end: (10,0)->(15,0) -> (12.5,0)
    expect(out.points[0]).toEqual([2.5, 0]);
    expect(out.points[1]).toEqual([12.5, 0]);
  });

  it("passes prev through unchanged when the groups do not match (different label)", () => {
    const prevPts = boxPoints(0, 0, 10, 10);
    const prev = lineList(prevPts);
    const next = lineList(boxPoints(5, 0, 10, 10));
    const out = interpolateLineList(
      prev,
      next,
      [text("car", [5, 5])],
      [text("truck", [10, 5])],
      0.5
    );
    expect(out.points).toEqual(prevPts);
  });

  it("passes prev through when matched groups have differing segment counts", () => {
    const prevPts = boxPoints(0, 0, 10, 10); // 4 segments
    const prev = lineList(prevPts);
    // A 3-segment triangle with the same label and identical bounding box: it
    // matches (label + centroid + IoU) but can't be lerped segment-for-segment,
    // so appendInterpolatedSegments must pass prev through unchanged.
    const next = lineList([
      [0, 0],
      [10, 0],
      [10, 0],
      [5, 10],
      [5, 10],
      [0, 0],
    ]);
    const out = interpolateLineList(
      prev,
      next,
      [text("car", [5, 5])],
      [text("car", [5, 5])],
      0.5
    );
    expect(out.points).toEqual(prevPts);
  });

  it("interpolates an unlabeled group from the fallback chunking", () => {
    const prev = lineList(boxPoints(0, 0, 10, 10));
    const next = lineList(boxPoints(5, 0, 10, 10));
    // 4 segments with 3 texts -> 4 % 3 !== 0 -> grouping falls back to ONE
    // unlabeled (label: null) group; null === null still matches and lerps.
    const texts = [text("a", [0, 0]), text("b", [1, 1]), text("c", [2, 2])];
    const out = interpolateLineList(prev, next, texts, texts, 0.5);
    expect(out.points).toHaveLength(8);
    expect(out.points[0]).toEqual([2.5, 0]);
  });
});

describe("matchLineListGroups", () => {
  const A = makeGroup(boxSegments(0, 0, 10, 10), "car");

  it("matches a same-label group that is close and overlapping", () => {
    const next = makeGroup(boxSegments(5, 0, 10, 10), "car");
    const [pair] = matchLineListGroups([A], [next]);
    expect(pair.next).toBe(next);
  });

  it("does not match when labels differ", () => {
    const next = makeGroup(boxSegments(5, 0, 10, 10), "truck");
    expect(matchLineListGroups([A], [next])[0].next).toBeNull();
  });

  it("does not match when centroids are beyond MATCH_DISTANCE_PX", () => {
    const next = makeGroup(boxSegments(300, 0, 10, 10), "car");
    expect(matchLineListGroups([A], [next])[0].next).toBeNull();
  });

  it("does not match when AABB IoU is below MIN_MATCH_IOU", () => {
    // shifted by 9 -> overlap 1x10=10, union 190, IoU ~0.053 < 0.15
    const next = makeGroup(boxSegments(9, 0, 10, 10), "car");
    expect(matchLineListGroups([A], [next])[0].next).toBeNull();
  });

  it("is greedy: a claimed next cannot be reused by a later prev", () => {
    const A2 = makeGroup(boxSegments(0, 0, 10, 10), "car");
    const next = makeGroup(boxSegments(5, 0, 10, 10), "car");
    const pairs = matchLineListGroups([A, A2], [next]);
    expect(pairs[0].next).toBe(next);
    expect(pairs[1].next).toBeNull();
  });

  it("assigns each prev group to its own matching next group", () => {
    const p0 = makeGroup(boxSegments(0, 0, 10, 10), "car");
    const p1 = makeGroup(boxSegments(100, 0, 10, 10), "car");
    // next groups overlap each prev's location but are listed in reverse order.
    const nFar = makeGroup(boxSegments(101, 0, 10, 10), "car"); // overlaps p1
    const nNear = makeGroup(boxSegments(1, 0, 10, 10), "car"); // overlaps p0
    const pairs = matchLineListGroups([p0, p1], [nFar, nNear]);
    expect(pairs[0].next).toBe(nNear);
    expect(pairs[1].next).toBe(nFar);
  });

  it("breaks ties by lowest Chamfer distance regardless of candidate order", () => {
    const far = makeGroup(boxSegments(4, 0, 10, 10), "car"); // chamfer ~4
    const near = makeGroup(boxSegments(2, 0, 10, 10), "car"); // chamfer ~2 (lowest)
    const mid = makeGroup(boxSegments(3, 0, 10, 10), "car"); // chamfer ~3
    // Lowest-chamfer candidate sits in the MIDDLE, so picking it rules out both
    // first-wins and last-wins; only true minimization selects `near`.
    const [pair] = matchLineListGroups([A], [far, near, mid]);
    expect(pair.next).toBe(near);
  });
});

describe("interpolateImageAnnotations", () => {
  it("interpolates circles, texts, and line-list points together", () => {
    const prev = viz({
      circles: [circle([0, 0], 10)],
      texts: [text("car", [0, 0])],
      points: [lineList(boxPoints(0, 0, 10, 10))],
    });
    const next = viz({
      circles: [circle([10, 10], 20)],
      texts: [text("car", [10, 10])],
      points: [lineList(boxPoints(5, 0, 10, 10))],
    });

    const out = interpolateImageAnnotations(prev, next, 0.5);

    expect(out.kind).toBe(VISUALIZATION_KIND.IMAGE_ANNOTATIONS);
    expect(out.circles[0].position).toEqual([5, 5]);
    expect(out.circles[0].diameter).toBe(15);
    expect(out.texts[0].position).toEqual([5, 5]);
    expect(out.points[0].type).toBe("line-list");
    expect(out.points[0].points).toHaveLength(8);
    expect(out.points[0].points[0]).toEqual([2.5, 0]);
  });

  it("preserves the kind discriminant", () => {
    const v = viz();
    expect(interpolateImageAnnotations(v, v, 0.5).kind).toBe(
      VISUALIZATION_KIND.IMAGE_ANNOTATIONS
    );
  });
});
