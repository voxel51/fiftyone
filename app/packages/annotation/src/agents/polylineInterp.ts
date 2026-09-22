/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Linear interpolation of `Polyline` geometry between two keyframes.
 *
 * The hard part isn't the lerp, it's that the two keyframes may not have the
 * same number of vertices — the user inserts or deletes points as they trace an
 * object. Vertex counts are matched by **inserting** points, never by
 * redistributing them:
 *
 *   `padTo` repeatedly splits the smaller ring's longest edge at its midpoint.
 *   Inserted points lie on the ring's own edges, so the padded ring renders
 *   identically to the original, which makes `interpolate(A, B, 0)`
 *   geometrically equal to A and `interpolate(A, B, 1)` equal to B.
 *
 * Equal-arc-length resampling would instead move every vertex to a uniform
 * perimeter position, so the span's endpoints become `resample(A)` /
 * `resample(B)` rather than A / B.
 *
 * Deliberately simple beyond that — one cyclic-offset search, then a plain
 * component-wise lerp. Two known and accepted limitations:
 *
 *   - No vertex *identity*: a semantically meaningful corner can drift along
 *     the perimeter, because the offset search matches position, not corners.
 *   - No rotation handling: a straight-line lerp cuts the chord where the
 *     object travels the arc, so a rotating polygon shrinks mid-segment.
 *     Adding a keyframe where rotation is fastest is the workaround.
 */

export type Point = [number, number];
/** One shape of a `Polyline.points` list — a ring (closed) or a path (open). */
export type Ring = Point[];

const dist = (a: Point, b: Point): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

const lerpPoint = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

const centroid = (ring: Ring): Point => {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
};

/** Shoelace area; sign carries the winding direction. */
const signedArea = (ring: Ring): number => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
};

/**
 * Grow `ring` to `n` vertices by repeatedly splitting its longest edge at the
 * midpoint. Never moves an existing vertex, so the result is geometrically
 * identical to the input, which keeps `t = 0` / `t = 1` exact.
 *
 * @param ring - Ring to pad. Returned as-is when already at least `n` long.
 * @param n - Target vertex count.
 * @param closed - Whether the last vertex connects back to the first. Open
 *   paths must not split the phantom closing edge.
 */
export const padTo = (ring: Ring, n: number, closed = true): Ring => {
  const out: Ring = ring.map((p) => [p[0], p[1]] as Point);

  while (out.length < n) {
    const last = closed ? out.length : out.length - 1;
    let bestIdx = 0;
    let bestLen = -1;

    for (let i = 0; i < last; i++) {
      const d = dist(out[i], out[(i + 1) % out.length]);
      if (d > bestLen) {
        bestLen = d;
        bestIdx = i;
      }
    }

    if (bestLen <= 0) {
      // Degenerate (all coincident points) — duplicating the first vertex keeps
      // the count contract without dividing by zero.
      out.push([out[0][0], out[0][1]]);
      continue;
    }

    out.splice(
      bestIdx + 1,
      0,
      lerpPoint(out[bestIdx], out[(bestIdx + 1) % out.length], 0.5),
    );
  }

  return out;
};

/**
 * Reorder `b` (same length as `a`) so index-wise pairing is sensible: pick the
 * cyclic rotation, and the winding, that minimise the sum of squared distances.
 * The rotation matters because vertex 0 of a redrawn polygon is arbitrary;
 * testing the reversed winding guards against a redraw in the other direction.
 *
 * O(n^2) with a tiny constant — `n` is `max(nA, nB)`, typically well under 30 —
 * so this runs synchronously on the main thread like the bbox lerp does.
 */
export const alignCyclic = (a: Ring, b: Ring): Ring => {
  const n = a.length;
  if (n === 0 || b.length !== n) return b;

  const reversed: Ring = [b[0], ...b.slice(1).reverse()];
  let best: { cost: number; ring: Ring } | null = null;

  for (const candidate of [b, reversed]) {
    for (let k = 0; k < n; k++) {
      let cost = 0;
      for (let i = 0; i < n; i++) {
        const p = candidate[(i + k) % n];
        cost += (a[i][0] - p[0]) ** 2 + (a[i][1] - p[1]) ** 2;
      }
      if (!best || cost < best.cost) {
        best = { cost, ring: a.map((_, i) => candidate[(i + k) % n]) };
      }
    }
  }

  return best ? best.ring : b;
};

/**
 * Open paths keep their endpoints: only the "is it drawn backwards" question is
 * open, so compare forward against reversed and take the cheaper pairing.
 */
export const alignOpen = (a: Ring, b: Ring): Ring => {
  if (a.length !== b.length) return b;

  const reversed = [...b].reverse();
  const cost = (candidate: Ring) =>
    candidate.reduce(
      (sum, p, i) => sum + (a[i][0] - p[0]) ** 2 + (a[i][1] - p[1]) ** 2,
      0,
    );

  return cost(reversed) < cost(b) ? reversed : b;
};

/** Component-wise lerp of two equal-length rings. */
export const lerpRing = (a: Ring, b: Ring, t: number): Ring =>
  a.map((p, i) => lerpPoint(p, b[i], t));

/**
 * Two vertices count as "the same vertex" when they're bitwise-ish equal. An
 * untouched vertex is copied verbatim from one keyframe to the next, so exact
 * comparison (with a hair of float tolerance) is the right test — a vertex the
 * annotator actually nudged should NOT anchor.
 */
const SAME_VERTEX_EPS = 1e-9;

const samePoint = (a: Point, b: Point): boolean =>
  Math.abs(a[0] - b[0]) <= SAME_VERTEX_EPS &&
  Math.abs(a[1] - b[1]) <= SAME_VERTEX_EPS;

/**
 * Longest order-preserving sequence of vertices that are identical in both
 * keyframes — the vertices the annotator left alone. Standard LCS over vertex
 * equality; O(n·m) with n, m being vertex counts (tens at most).
 *
 * These become **anchors**: they pair with themselves, so they don't move at any
 * point in the span. Everything else is reconciled *between* them.
 */
export const anchorPairs = (a: Ring, b: Ring): Array<[number, number]> => {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = samePoint(a[i], b[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: Array<[number, number]> = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (samePoint(a[i], b[j])) {
      out.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  return out;
};

const rotateRing = (ring: Ring, k: number): Ring =>
  k === 0 ? ring : [...ring.slice(k), ...ring.slice(0, k)];

/** Whether every vertex of `a` moved by the same vector to reach `b`. */
const isTranslation = (a: Ring, b: Ring): boolean => {
  const dx = b[0][0] - a[0][0];
  const dy = b[0][1] - a[0][1];

  return a.every(
    (p, i) =>
      Math.abs(b[i][0] - p[0] - dx) <= SAME_VERTEX_EPS &&
      Math.abs(b[i][1] - p[1] - dy) <= SAME_VERTEX_EPS,
  );
};

/**
 * Grow a gap's run of vertices to `target`, inserting along the run *and its
 * bounding anchors* so new vertices land on the shape's own geometry between the
 * anchors — never somewhere else entirely.
 */
const growRun = (
  run: Ring,
  target: number,
  before: Point | null,
  after: Point | null,
): Ring => {
  if (run.length >= target) return run;

  const path: Ring = [
    ...(before ? [before] : []),
    ...run,
    ...(after ? [after] : []),
  ];
  const bounds = (before ? 1 : 0) + (after ? 1 : 0);
  const grown = padTo(path, target + bounds, false);

  return grown.slice(before ? 1 : 0, grown.length - (after ? 1 : 0));
};

/**
 * Build the two equal-length vertex lists to lerp between, preserving the
 * annotator's vertex identity.
 *
 * Within one track the vertex order is meaningful — the annotator drags, inserts
 * and deletes individual points — so correspondence is **known**, not something
 * to search for. Anchor on the vertices that are identical in both keyframes and
 * reconcile counts only inside the gaps between anchors. An inserted vertex then
 * grows out of the edge it was inserted into, and everything the annotator left
 * alone stays exactly put.
 *
 * Only when the two keyframes share **no** vertices at all (the shape was
 * redrawn from scratch, so identity genuinely is unknown) do we fall back to the
 * positional search over cyclic offset + winding.
 */
export const correspond = (a: Ring, b: Ring, closed: boolean): [Ring, Ring] => {
  const shared = anchorPairs(a, b);

  // Equal counts usually mean no vertex was inserted or deleted, so index `i`
  // already corresponds to index `i`. Trust the indices when the anchors agree
  // with them, or when the whole shape moved rigidly: a vertex that lands on
  // another vertex's old position (a shape translated by its own vertex spacing)
  // reads as an anchor but is a coincidence, and anchoring on it would pin it
  // while its neighbours move. Equal counts with anchors that DISAGREE with the
  // indices mean a deletion and an insertion in the same keyframe; the anchored
  // path below is what keeps the untouched vertices still there.
  //
  // A redraw (equal counts, no shared vertices) still needs the positional
  // search below, so require at least one anchor before trusting the indices.
  if (
    a.length === b.length &&
    shared.length > 0 &&
    (shared.every(([i, j]) => i === j) || isTranslation(a, b))
  ) {
    return [a, b];
  }

  if (shared.length === 0) {
    const n = Math.max(a.length, b.length);
    const pa = padTo(a, n, closed);
    const pb = padTo(b, n, closed);
    return [pa, closed ? alignCyclic(pa, pb) : alignOpen(pa, pb)];
  }

  // For a closed ring, rotate both so the first anchor leads; the gap that wraps
  // past the end then closes back onto that anchor like any other gap.
  let ra = a;
  let rb = b;
  if (closed) {
    const [ai, bj] = shared[0];
    ra = rotateRing(a, ai);
    rb = rotateRing(b, bj);
  }

  const anchors = closed ? anchorPairs(ra, rb) : shared;
  const outA: Ring = [];
  const outB: Ring = [];

  for (let k = 0; k <= anchors.length; k++) {
    const prev = k > 0 ? anchors[k - 1] : null;
    const next = k < anchors.length ? anchors[k] : null;

    const aRun = ra.slice(prev ? prev[0] + 1 : 0, next ? next[0] : ra.length);
    const bRun = rb.slice(prev ? prev[1] + 1 : 0, next ? next[1] : rb.length);
    const target = Math.max(aRun.length, bRun.length);

    if (target > 0) {
      // A closed ring's trailing gap runs back into the leading anchor.
      const afterA = next ? ra[next[0]] : closed ? ra[0] : null;
      const afterB = next ? rb[next[1]] : closed ? rb[0] : null;
      const beforeA = prev ? ra[prev[0]] : null;
      const beforeB = prev ? rb[prev[1]] : null;

      outA.push(...growRun(aRun, target, beforeA, afterA));
      outB.push(...growRun(bRun, target, beforeB, afterB));
    }

    if (next) {
      outA.push(ra[next[0]]);
      outB.push(rb[next[1]]);
    }
  }

  return [outA, outB];
};

/**
 * Interpolate one shape: build the correspondence, then lerp it.
 */
export const interpolateRing = (
  a: Ring,
  b: Ring,
  t: number,
  closed: boolean,
): Ring => {
  if (a.length === 0) return b;
  if (b.length === 0) return a;

  const [from, to] = correspond(a, b, closed);

  return lerpRing(from, to, t);
};

/**
 * Pair up the shapes of two keyframes. Within one track the shape order is
 * known — the same list, edited — so equal counts pair by index. When a shape
 * was added or removed, rings are matched greedily by centroid distance
 * normalised by sqrt(area), which is scale-tolerant and cheap (shape counts are
 * tiny). Unmatched rings are reported with a `null` counterpart — callers
 * step-hold those rather than interpolating them (a ring growing out of a point
 * reads as a rendering bug, not as motion).
 */
export const matchRings = (
  a: Ring[],
  b: Ring[],
): Array<{ from: Ring | null; to: Ring | null }> => {
  const ringsA = a.filter((ring) => ring.length > 0);
  const ringsB = b.filter((ring) => ring.length > 0);

  if (ringsA.length === ringsB.length) {
    return ringsA.map((from, i) => ({ from, to: ringsB[i] }));
  }

  const pairs: Array<{ from: Ring | null; to: Ring | null }> = [];
  const takenB = new Set<number>();

  for (const ring of a) {
    if (ring.length === 0) continue;

    const cA = centroid(ring);
    const scaleA = Math.sqrt(Math.abs(signedArea(ring))) || 1;
    let bestIdx = -1;
    let bestCost = Infinity;

    for (let j = 0; j < b.length; j++) {
      if (takenB.has(j) || b[j].length === 0) continue;
      const cB = centroid(b[j]);
      const scaleB = Math.sqrt(Math.abs(signedArea(b[j]))) || 1;
      const cost = dist(cA, cB) / ((scaleA + scaleB) / 2);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = j;
      }
    }

    if (bestIdx === -1) {
      pairs.push({ from: ring, to: null });
    } else {
      takenB.add(bestIdx);
      pairs.push({ from: ring, to: b[bestIdx] });
    }
  }

  for (let j = 0; j < b.length; j++) {
    if (!takenB.has(j) && b[j].length > 0) {
      pairs.push({ from: null, to: b[j] });
    }
  }

  return pairs;
};

/**
 * Interpolate a whole `Polyline.points` value (a list of shapes) at `t`.
 *
 * Matched shapes interpolate; unmatched ones step-hold, so a shape that only
 * exists at one end of the span simply isn't drawn on the other end's side of
 * the segment. `closed` comes from the left keyframe — a `closed` mismatch
 * between keyframes is a labelling error, not motion, so it isn't animated.
 *
 * @param from - Left keyframe's `points`.
 * @param to - Right keyframe's `points`.
 * @param t - Fraction through the span, `0` at `from`, `1` at `to`.
 * @param closed - Left keyframe's `closed` flag.
 */
export const interpolatePoints = (
  from: Ring[],
  to: Ring[],
  t: number,
  closed: boolean,
): Ring[] => {
  const out: Ring[] = [];

  for (const { from: a, to: b } of matchRings(from, to)) {
    if (a && b) {
      out.push(interpolateRing(a, b, t, closed));
    } else if (a) {
      // present only at the left keyframe — hold it until the span ends
      if (t < 1) out.push(a.map((p) => [p[0], p[1]] as Point));
    } else if (b) {
      // appears at the right keyframe — don't grow it out of nothing
      if (t >= 1) out.push(b.map((p) => [p[0], p[1]] as Point));
    }
  }

  return out;
};
