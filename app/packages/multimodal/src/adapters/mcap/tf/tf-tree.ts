import type { Quat, Vec3 } from "../../../decoders";

/**
 * 4x4 column-major transformation matrix represented as a row-major
 * Float32Array of 16 elements. Three.js's `Matrix4.fromArray()` accepts
 * either convention; we standardize on column-major to match WebGL math
 * libraries.
 */
export type Mat4 = Float32Array;

interface TransformSample {
  readonly timeNs: bigint;
  readonly translation: Vec3;
  readonly rotation: Quat;
}

/**
 * Coordinate-frame graph built from a stream of `foxglove.FrameTransform`
 * messages. Each (parent → child) pair holds a time-sorted history of
 * (translation, rotation) samples; lookups binary-search the latest
 * sample at or before the requested time.
 *
 * `lookupChain(from, to, t)` walks the graph from `from` to `to` (BFS
 * since the graph is small) and composes the per-edge matrices at time
 * `t`. Returns `null` when no path connects the two frames or when one
 * of the edges has no sample at or before `t`.
 */
export class TfTree {
  /**
   * Forward edges: `forward.get(parent)[child]` is the history of
   * transforms that take a point in child-frame coordinates and return
   * the corresponding parent-frame coordinates. (Foxglove's
   * `FrameTransform` semantics.)
   */
  private readonly forward = new Map<string, Map<string, TransformSample[]>>();

  /**
   * Reverse edges (auto-populated): present so a BFS can traverse the
   * graph in either direction. A reverse-edge transform is the inverse
   * of the forward transform at the same timestamp.
   */
  private readonly reverse = new Map<string, Map<string, TransformSample[]>>();

  /** All frame ids ever observed. */
  private readonly frames = new Set<string>();

  addTransform(
    parent: string,
    child: string,
    timeNs: bigint,
    translation: Vec3,
    rotation: Quat
  ): void {
    if (!parent || !child) return;
    this.frames.add(parent);
    this.frames.add(child);

    appendSample(this.forward, parent, child, {
      timeNs,
      translation,
      rotation,
    });
    appendSample(this.reverse, child, parent, {
      timeNs,
      translation,
      rotation,
    });
  }

  /**
   * Sort every per-edge history by timestamp. Call once after bulk
   * loading; subsequent `addTransform` calls keep order if you feed
   * them in time order.
   */
  finalize(): void {
    for (const inner of this.forward.values())
      for (const history of inner.values())
        history.sort(compareSamples);
    for (const inner of this.reverse.values())
      for (const history of inner.values())
        history.sort(compareSamples);
  }

  hasFrame(frame: string): boolean {
    return this.frames.has(frame);
  }

  /**
   * Resolves the 4x4 matrix `M` such that `point_in_to = M * point_in_from`
   * at time `timeNs`. Returns `null` if `from` and `to` aren't connected
   * or any edge along the path lacks a sample at or before `timeNs`.
   */
  lookupChain(from: string, to: string, timeNs: bigint): Mat4 | null {
    if (from === to) return identityMatrix();
    if (!this.frames.has(from) || !this.frames.has(to)) return null;

    const path = this.findPath(from, to);
    if (!path) return null;

    // Compose edge transforms left-to-right.
    let m = identityMatrix();
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const edge = this.lookupEdge(a, b, timeNs);
      if (!edge) return null;
      m = multiplyMatrices(edge, m);
    }
    return m;
  }

  private findPath(from: string, to: string): string[] | null {
    if (from === to) return [from];
    const queue: string[] = [from];
    const cameFrom = new Map<string, string>();
    cameFrom.set(from, from);
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      if (cur === to) {
        const path: string[] = [];
        let n = to;
        while (n !== from) {
          path.unshift(n);
          n = cameFrom.get(n) as string;
        }
        path.unshift(from);
        return path;
      }
      for (const neighbor of this.neighborsOf(cur)) {
        if (cameFrom.has(neighbor)) continue;
        cameFrom.set(neighbor, cur);
        queue.push(neighbor);
      }
    }
    return null;
  }

  private *neighborsOf(frame: string): Generator<string, void, void> {
    const fwd = this.forward.get(frame);
    if (fwd) for (const k of fwd.keys()) yield k;
    const rev = this.reverse.get(frame);
    if (rev) for (const k of rev.keys()) yield k;
  }

  /**
   * Returns the 4x4 matrix that maps a point expressed in frame `a`
   * into frame `b`'s coordinates at time `timeNs`. Walks one edge of
   * the graph in either direction (forward or reverse).
   */
  private lookupEdge(a: string, b: string, timeNs: bigint): Mat4 | null {
    // Foxglove's FrameTransform parent→child entry means "point in
    // child coords → point in parent coords". To go FROM frame `a` TO
    // frame `b`, we need the inverse of the parent→child transform
    // when `a` is the parent.
    const fwd = this.forward.get(a)?.get(b);
    if (fwd) {
      // a→b means a is parent, b is child. We want point-in-a → point-in-b
      // which is the INVERSE of the stored parent→child matrix.
      const sample = latestSampleAtOrBefore(fwd, timeNs);
      if (sample) return invertRigid(sampleToMatrix(sample));
    }
    const rev = this.reverse.get(a)?.get(b);
    if (rev) {
      // Reverse map: stored as (parent=b, child=a). We want
      // point-in-a → point-in-b, which IS the stored matrix (parent←child).
      const sample = latestSampleAtOrBefore(rev, timeNs);
      if (sample) return sampleToMatrix(sample);
    }
    return null;
  }
}

function appendSample(
  table: Map<string, Map<string, TransformSample[]>>,
  parent: string,
  child: string,
  sample: TransformSample
): void {
  let inner = table.get(parent);
  if (!inner) {
    inner = new Map();
    table.set(parent, inner);
  }
  let history = inner.get(child);
  if (!history) {
    history = [];
    inner.set(child, history);
  }
  history.push(sample);
}

function compareSamples(a: TransformSample, b: TransformSample): number {
  if (a.timeNs < b.timeNs) return -1;
  if (a.timeNs > b.timeNs) return 1;
  return 0;
}

function latestSampleAtOrBefore(
  history: readonly TransformSample[],
  timeNs: bigint
): TransformSample | null {
  if (history.length === 0) return null;
  // Binary search for the largest index whose timeNs <= timeNs.
  let lo = 0;
  let hi = history.length - 1;
  if (history[0].timeNs > timeNs) return history[0]; // earliest known wins
  if (history[hi].timeNs <= timeNs) return history[hi];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (history[mid].timeNs <= timeNs) lo = mid;
    else hi = mid - 1;
  }
  return history[lo];
}

// ---------------------------------------------------------------------------
// 4x4 matrix math (column-major). Three.js' `Matrix4.fromArray()` reads
// column-major Float32Array; that's what we produce.
// ---------------------------------------------------------------------------

function identityMatrix(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

/**
 * Compose a parent←child rigid transform from a quaternion rotation
 * and a translation vector. Returns a column-major Float32Array(16).
 */
function sampleToMatrix(sample: TransformSample): Mat4 {
  const [tx, ty, tz] = sample.translation;
  const [qx, qy, qz, qw] = sample.rotation;
  // Normalize the quaternion defensively.
  const n = Math.hypot(qx, qy, qz, qw) || 1;
  const x = qx / n;
  const y = qy / n;
  const z = qz / n;
  const w = qw / n;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  const m = new Float32Array(16);
  m[0] = 1 - 2 * (yy + zz);
  m[1] = 2 * (xy + wz);
  m[2] = 2 * (xz - wy);
  m[3] = 0;

  m[4] = 2 * (xy - wz);
  m[5] = 1 - 2 * (xx + zz);
  m[6] = 2 * (yz + wx);
  m[7] = 0;

  m[8] = 2 * (xz + wy);
  m[9] = 2 * (yz - wx);
  m[10] = 1 - 2 * (xx + yy);
  m[11] = 0;

  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  m[15] = 1;
  return m;
}

/**
 * Inverse of a rigid (rotation + translation, no scale/shear) transform.
 * Transposes the rotation block and reflects the translation.
 */
function invertRigid(m: Mat4): Mat4 {
  const out = new Float32Array(16);
  // Transpose rotation.
  out[0] = m[0];
  out[1] = m[4];
  out[2] = m[8];
  out[4] = m[1];
  out[5] = m[5];
  out[6] = m[9];
  out[8] = m[2];
  out[9] = m[6];
  out[10] = m[10];
  // -R^T * t
  const tx = m[12];
  const ty = m[13];
  const tz = m[14];
  out[12] = -(out[0] * tx + out[4] * ty + out[8] * tz);
  out[13] = -(out[1] * tx + out[5] * ty + out[9] * tz);
  out[14] = -(out[2] * tx + out[6] * ty + out[10] * tz);
  out[15] = 1;
  return out;
}

/**
 * Right-multiplies `b` by `a` — column-major: `result = a · b`.
 * Allocates a new matrix.
 */
function multiplyMatrices(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[row + k * 4] * b[k + col * 4];
      out[row + col * 4] = s;
    }
  }
  return out;
}
