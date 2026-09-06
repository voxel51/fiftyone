/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The two load-bearing invariants are `endpoints are exact` and `the per-frame
 * step is uniform` — an earlier arc-length-resampling implementation satisfied
 * neither (it snapped ~10x the interior step at both ends of every span) and
 * both tests catch that regression directly.
 *
 * Distances are measured **outline to outline** (point-to-segment), never
 * point-to-vertex: `padTo` inserts midpoints on existing edges, so a vertex-set
 * metric reports an identical shape as a large error.
 */

import { describe, expect, it } from "vitest";
import {
  alignCyclic,
  interpolatePoints,
  interpolateRing,
  matchRings,
  padTo,
  type Point,
  type Ring,
} from "./polylineInterp";

const SQUARE: Ring = [
  [0.2, 0.2],
  [0.8, 0.2],
  [0.8, 0.8],
  [0.2, 0.8],
];

const BLOB: Ring = [
  [0.3, 0.22],
  [0.52, 0.15],
  [0.72, 0.27],
  [0.81, 0.49],
  [0.72, 0.71],
  [0.55, 0.81],
  [0.35, 0.77],
  [0.23, 0.6],
  [0.21, 0.38],
];

/** Distance from `p` to segment `a`-`b`. */
const pointToSegment = (p: Point, a: Point, b: Point): number => {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len = vx * vx + vy * vy;
  const t =
    len < 1e-15
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len),
        );
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
};

const pointToRing = (p: Point, ring: Ring): number =>
  Math.min(
    ...ring.map((q, i) => pointToSegment(p, q, ring[(i + 1) % ring.length])),
  );

/** Symmetric outline distance — 0 iff the two rings draw the same shape. */
const outlineDistance = (a: Ring, b: Ring): number =>
  Math.max(
    ...a.map((p) => pointToRing(p, b)),
    ...b.map((p) => pointToRing(p, a)),
  );

const translate = (ring: Ring, dx: number, dy: number): Ring =>
  ring.map(([x, y]) => [x + dx, y + dy] as Point);

const rotate = (ring: Ring, radians: number): Ring => {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return ring.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as Point;
  });
};

const shoelace = (ring: Ring): number => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum / 2);
};

/** Insert a vertex as an outward-pushed edge midpoint, keeping the ring simple. */
const withExtraVertex = (ring: Ring, at = 1): Ring => {
  const next = (at + 1) % ring.length;
  const mid: Point = [
    (ring[at][0] + ring[next][0]) / 2,
    (ring[at][1] + ring[next][1]) / 2,
  ];
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const dx = mid[0] - cx;
  const dy = mid[1] - cy;
  const len = Math.hypot(dx, dy) || 1;
  const out: Ring = ring.map((p) => [p[0], p[1]] as Point);
  out.splice(at + 1, 0, [
    mid[0] + (dx / len) * 0.05,
    mid[1] + (dy / len) * 0.05,
  ]);
  return out;
};

describe("padTo", () => {
  it("reaches the target count without moving an existing vertex", () => {
    const padded = padTo(BLOB, 12);

    expect(padded).toHaveLength(12);
    for (const original of BLOB) {
      expect(
        padded.some((p) => p[0] === original[0] && p[1] === original[1]),
      ).toBe(true);
    }
  });

  it("renders identically to the input (inserted points lie on its edges)", () => {
    expect(outlineDistance(padTo(BLOB, 20), BLOB)).toBeCloseTo(0, 12);
    expect(outlineDistance(padTo(SQUARE, 9), SQUARE)).toBeCloseTo(0, 12);
  });

  it("leaves a ring already at or above the target untouched", () => {
    expect(padTo(SQUARE, 3)).toHaveLength(4);
  });

  it("does not split the phantom closing edge of an open path", () => {
    const open: Ring = [
      [0, 0],
      [1, 0],
    ];
    const padded = padTo(open, 3, false);

    expect(padded).toHaveLength(3);
    // the midpoint must land on the real edge, not on a (0,0)-(1,0) wrap
    expect(padded[1]).toEqual([0.5, 0]);
  });

  it("survives a degenerate ring of coincident points", () => {
    const degenerate: Ring = [
      [0.5, 0.5],
      [0.5, 0.5],
      [0.5, 0.5],
    ];
    expect(padTo(degenerate, 5)).toHaveLength(5);
  });
});

describe("alignCyclic", () => {
  it("undoes an arbitrary start-vertex rotation", () => {
    const rotated: Ring = [...SQUARE.slice(2), ...SQUARE.slice(0, 2)];
    expect(alignCyclic(SQUARE, rotated)).toEqual(SQUARE);
  });

  it("undoes a reversed winding", () => {
    const reversed: Ring = [SQUARE[0], ...SQUARE.slice(1).reverse()];
    expect(alignCyclic(SQUARE, reversed)).toEqual(SQUARE);
  });
});

describe("interpolateRing — endpoints are exact", () => {
  it("returns the source shapes at t=0 and t=1 for equal vertex counts", () => {
    const moved = translate(BLOB, 0.05, 0.03);

    expect(
      outlineDistance(interpolateRing(BLOB, moved, 0, true), BLOB),
    ).toBeCloseTo(0, 12);
    expect(
      outlineDistance(interpolateRing(BLOB, moved, 1, true), moved),
    ).toBeCloseTo(0, 12);
  });

  it("returns the source shapes at t=0 and t=1 across a vertex insertion", () => {
    const grown = translate(withExtraVertex(BLOB), 0.05, 0.03);
    expect(grown.length).toBe(BLOB.length + 1);

    expect(
      outlineDistance(interpolateRing(BLOB, grown, 0, true), BLOB),
    ).toBeCloseTo(0, 12);
    expect(
      outlineDistance(interpolateRing(BLOB, grown, 1, true), grown),
    ).toBeCloseTo(0, 12);
  });

  it("returns the source shapes at t=0 and t=1 across a vertex deletion", () => {
    const shrunk = translate(
      BLOB.filter((_, i) => i !== 3),
      0.04,
      0.02,
    );

    expect(
      outlineDistance(interpolateRing(BLOB, shrunk, 0, true), BLOB),
    ).toBeCloseTo(0, 12);
    expect(
      outlineDistance(interpolateRing(BLOB, shrunk, 1, true), shrunk),
    ).toBeCloseTo(0, 12);
  });
});

describe("interpolateRing — motion", () => {
  it("steps uniformly across the span (no snap at either end)", () => {
    const grown = translate(withExtraVertex(BLOB), 0.06, 0.04);
    const frames = 12;

    const rings = Array.from({ length: frames + 1 }, (_, i) =>
      interpolateRing(BLOB, grown, i / frames, true),
    );

    const steps: number[] = [];
    for (let i = 1; i < rings.length; i++) {
      const a = rings[i - 1];
      const b = rings[i];
      // same vertex count throughout, so index-wise displacement is meaningful
      expect(b).toHaveLength(a.length);
      steps.push(
        Math.max(
          ...a.map((p, k) => Math.hypot(p[0] - b[k][0], p[1] - b[k][1])),
        ),
      );
    }

    const min = Math.min(...steps);
    const max = Math.max(...steps);
    expect(max - min).toBeLessThan(1e-9);
  });

  it("emits a stable vertex count across the span", () => {
    const grown = withExtraVertex(BLOB);
    const counts = new Set(
      Array.from(
        { length: 11 },
        (_, i) => interpolateRing(BLOB, grown, i / 10, true).length,
      ),
    );

    expect(counts).toEqual(new Set([Math.max(BLOB.length, grown.length)]));
  });

  it("interpolates a pure translation as the midpoint shape", () => {
    const moved = translate(SQUARE, 0.1, 0);
    const mid = interpolateRing(SQUARE, moved, 0.5, true);

    const expected: Ring = [
      [0.25, 0.2],
      [0.85, 0.2],
      [0.85, 0.8],
      [0.25, 0.8],
    ];

    mid.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(expected[i][0], 12);
      expect(p[1]).toBeCloseTo(expected[i][1], 12);
    });
  });

  it("shrinks mid-span under rotation — the accepted v1 limitation", () => {
    const spun = rotate(SQUARE, Math.PI / 4);
    const mid = interpolateRing(SQUARE, spun, 0.5, true);

    // documents the known behaviour rather than asserting it's good: a
    // straight-line lerp cuts the chord where the object travels the arc
    expect(shoelace(mid)).toBeLessThan(shoelace(SQUARE) * 0.95);
  });
});

describe("interpolatePoints — multi-ring", () => {
  it("interpolates matched rings pairwise", () => {
    const a = [SQUARE, translate(SQUARE, 2, 0)];
    const b = [translate(SQUARE, 0, 0.1), translate(SQUARE, 2, 0.1)];
    const mid = interpolatePoints(a, b, 0.5, true);

    expect(mid).toHaveLength(2);
    expect(mid[0][0][1]).toBeCloseTo(0.25, 12);
    expect(mid[1][0][0]).toBeCloseTo(2.2, 12);
  });

  it("step-holds a ring that only exists at the left keyframe", () => {
    const a = [SQUARE, translate(SQUARE, 2, 0)];
    const b = [translate(SQUARE, 0, 0.1)];

    expect(interpolatePoints(a, b, 0.5, true)).toHaveLength(2);
    // gone once the span reaches the right keyframe
    expect(interpolatePoints(a, b, 1, true)).toHaveLength(1);
  });

  it("does not grow a ring that only appears at the right keyframe", () => {
    const a = [SQUARE];
    const b = [SQUARE, translate(SQUARE, 2, 0)];

    expect(interpolatePoints(a, b, 0.5, true)).toHaveLength(1);
    expect(interpolatePoints(a, b, 1, true)).toHaveLength(2);
  });

  it("ignores empty rings", () => {
    expect(
      interpolatePoints([SQUARE, []], [SQUARE, []], 0.5, true),
    ).toHaveLength(1);
  });
});

/**
 * Regression: real data from a `quickstart-video` test track (sample
 * 6a56b22e247bc700b4f4ee86, `frames.poly`, keyframes f1 and f12).
 *
 * The annotator deleted one vertex and inserted two in the MIDDLE of the path, so
 * 7 of the 8 original vertices — including the whole right-hand tail — are byte
 * identical between the two keyframes. Those must not move at any t.
 *
 * The first implementation moved them: `padTo` inserted its synthetic vertex at
 * the sparser path's own longest edge (A0->A1, in the tail), which shifted every
 * later index by one, so A1..A4 paired with B2..B5 and drifted up to 0.05 in
 * normalized coordinates despite being unchanged by the annotator.
 */
describe("interpolateRing — untouched vertices stay put (real track)", () => {
  // f1 — 8 vertices, open path
  const KF_A: Ring = [
    [0.6517, 0.2279],
    [0.6513, 0.4202],
    [0.6893, 0.3019],
    [0.5875, 0.2488],
    [0.5611, 0.2497],
    [0.4493, 0.2444],
    [0.2816, 0.2585],
    [0.2521, 0.406],
  ];
  // f12 — 9 vertices: A[5] deleted, two new vertices inserted mid-path
  const KF_B: Ring = [
    [0.6517, 0.2279],
    [0.6513, 0.4202],
    [0.6893, 0.3019],
    [0.5875, 0.2488],
    [0.5611, 0.2497],
    [0.5275, 0.4],
    [0.3997, 0.4169],
    [0.2816, 0.2585],
    [0.2521, 0.406],
  ];

  /** Present and identical in both keyframes — the annotator never touched them. */
  const UNCHANGED: Point[] = [
    [0.6517, 0.2279],
    [0.6513, 0.4202],
    [0.6893, 0.3019],
    [0.5875, 0.2488],
    [0.5611, 0.2497],
    [0.2816, 0.2585],
    [0.2521, 0.406],
  ];

  it("holds every vertex that is identical in both keyframes, at every t", () => {
    for (const t of [0, 0.1, 0.25, 0.4545, 0.5, 0.75, 0.9, 1]) {
      const out = interpolateRing(KF_A, KF_B, t, false);

      for (const vertex of UNCHANGED) {
        const drift = Math.min(
          ...out.map((p) => Math.hypot(p[0] - vertex[0], p[1] - vertex[1])),
        );
        expect(drift, `vertex ${vertex} at t=${t}`).toBeLessThan(1e-9);
      }
    }
  });

  it("still reproduces both keyframes exactly", () => {
    expect(
      outlineDistance(interpolateRing(KF_A, KF_B, 0, false), KF_A),
    ).toBeCloseTo(0, 12);
    expect(
      outlineDistance(interpolateRing(KF_A, KF_B, 1, false), KF_B),
    ).toBeCloseTo(0, 12);
  });
});

describe("correspond — a coincidental shared vertex is not an anchor", () => {
  // Regression: anchoring reads "this vertex is in both keyframes" as "the
  // annotator left it alone". When a shape is translated by the spacing between
  // two of its own vertices, one vertex lands exactly on another's old position
  // and that reading is wrong — the shape moved, nothing was left alone.
  // Anchoring only exists to absorb inserted / deleted vertices, so with equal
  // counts the indices are trusted directly.
  const TRI: Ring = [
    [0.1, 0.7],
    [0.2, 0.7],
    [0.2, 0.8],
  ];
  // +0.1 in y puts TRI[2] (0.2,0.8) exactly where the moved TRI[1] lands
  const TRI_MOVED = translate(TRI, 0, 0.1);

  it.each([true, false])(
    "interpolates a pure translation as a translation (closed=%s)",
    (closed) => {
      const mid = interpolateRing(TRI, TRI_MOVED, 0.5, closed);

      expect(mid).toHaveLength(3);
      mid.forEach(([x, y], i) => {
        expect(x).toBeCloseTo(TRI[i][0], 9);
        expect(y).toBeCloseTo(TRI[i][1] + 0.05, 9);
      });
    },
  );

  it.each([true, false])(
    "never grows the vertex count when the counts already match (closed=%s)",
    (closed) => {
      // The gaps between anchors pad independently, so they could sum past
      // max(nLeft, nRight) and emit a duplicate — an extra draggable point
      // appearing on filler frames.
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(interpolateRing(TRI, TRI_MOVED, t, closed)).toHaveLength(3);
      }
    },
  );

  it.each([true, false])(
    "still reproduces both keyframes exactly (closed=%s)",
    (closed) => {
      expect(interpolateRing(TRI, TRI_MOVED, 0, closed)).toEqual(TRI);
      expect(interpolateRing(TRI, TRI_MOVED, 1, closed)).toEqual(TRI_MOVED);
    },
  );

  it("still positionally aligns a redraw — equal counts, no shared vertex", () => {
    // The fast path requires at least one anchor, so a shape redrawn from
    // scratch (identity genuinely unknown) keeps using the positional search.
    const redrawn = rotate(translate(SQUARE, 0.011, 0.013), 0.05);
    const atZero = interpolateRing(SQUARE, redrawn, 0, true);

    expect(outlineDistance(atZero, SQUARE)).toBeLessThan(1e-9);
  });
});

describe("correspond — equal counts from a deletion plus an insertion", () => {
  // The annotator deletes one vertex and inserts another on the same keyframe,
  // so the counts match but the indices no longer line up: trusting them would
  // pair the deleted vertex with an untouched one and drag it across the span.
  const P0: Point = [0, 0];
  const X: Point = [0.5, 0.1];
  const P1: Point = [1, 0];
  const Y: Point = [1, 0.5];
  const P2: Point = [1, 1];
  const before: Ring = [P0, X, P1, P2];
  const after: Ring = [P0, P1, Y, P2];

  const holds = (ring: Ring, p: Point) =>
    ring.some(
      ([x, y]) => Math.abs(x - p[0]) < 1e-12 && Math.abs(y - p[1]) < 1e-12,
    );

  it.each([true, false])(
    "keeps every untouched vertex exactly still (closed=%s)",
    (closed) => {
      for (const t of [0.25, 0.5, 0.75]) {
        const mid = interpolateRing(before, after, t, closed);

        for (const p of [P0, P1, P2]) {
          expect(holds(mid, p), `t=${t}: ${JSON.stringify(p)}`).toBe(true);
        }
      }
    },
  );

  it.each([true, false])(
    "emits a stable vertex count across the span (closed=%s)",
    (closed) => {
      const counts = new Set(
        [0.1, 0.5, 0.9].map(
          (t) => interpolateRing(before, after, t, closed).length,
        ),
      );

      expect(counts.size).toBe(1);
    },
  );
});

describe("matchRings — shape order is known within a track", () => {
  it("pairs rings by index when the counts match", () => {
    const near = SQUARE;
    const far = translate(SQUARE, 2, 0);
    // centroid matching would cross-pair these; the list order says otherwise
    const pairs = matchRings([near, far], [far, near]);

    expect(pairs).toEqual([
      { from: near, to: far },
      { from: far, to: near },
    ]);
  });

  it("falls back to centroid matching when a ring was added", () => {
    const near = SQUARE;
    const far = translate(SQUARE, 2, 0);
    const pairs = matchRings([far], [near, far]);

    expect(pairs).toEqual([
      { from: far, to: far },
      { from: null, to: near },
    ]);
  });
});
