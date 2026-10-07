import * as THREE from "three";
import * as TSL from "three/tsl";
import {
  IndirectStorageBufferAttribute,
  StorageBufferAttribute,
} from "three/webgpu";

import {
  gpuPointCloudCulledSampleIndexNode,
  gpuPointCloudPositionNode,
  type GpuPointCloudSampleIndexNode,
} from "./gpu-point-cloud-position-nodes";
import type {
  PointCloudComputeNode,
  PointCloudComputeTslFacade,
  PointCloudComputeUniformNode,
} from "../../tsl-chainables";

// DRAFT (opt-in via ?pointCloudCompute=1, WebGPU only).
//
// Screen-coverage culling for one decoder-prepared point cloud. Instead of
// drawing the first N samples of the progressively ordered payload, four
// compute dispatches pick at most one sample per screen cell:
//
//   1. clear     — every cell := UNCLAIMED; visible count := 0
//   2. claim     — each in-frustum sample atomicMin's its index into its cell.
//                  Lower index = earlier in the worker's progressive order,
//                  so the winner is stable while the camera is still.
//   3. compact   — each sample that won its cell appends its index to the
//                  visible-index buffer (atomicAdd on the indirect args'
//                  instanceCount), bounded by the per-canvas budget.
//   4. finalize  — clamp instanceCount to the budget (the append counter can
//                  overshoot when more cells survive than the budget allows).
//
// The draw is drawIndexedIndirect over the sprite quad, so the surviving
// count never leaves the GPU. Known draft limits are listed in the report and
// at the relevant code below.

// Three's TSL compute/atomic exports are runtime-only in Fiber's typings.
const computeTsl: PointCloudComputeTslFacade = TSL;

const UNCLAIMED_CELL = 0xffffffff;
// GPUDrawIndexedIndirect args: indexCount, instanceCount, firstIndex,
// baseVertex, firstInstance.
const INDIRECT_ARG_COUNT = 5;
const INDIRECT_INSTANCE_COUNT = 1;
const MIN_CLIP_W = 1e-6;
const CELL_BUFFER_GROWTH = 1.5;
const MIN_CELL_CAPACITY = 1_024;
// Camera matrix (16) + viewport (2) + cell size + candidates + budget.
const VIEW_SIGNATURE_LENGTH = 21;

/** Renderer surface needed to dispatch the cull. */
export interface GpuPointCloudComputeRenderer {
  compute(nodes: readonly TSL.ComputeNode[]): unknown;
}

/** Runtime check that a Fiber `gl` is Three's WebGPURenderer with compute. */
export function isGpuPointCloudComputeRenderer(
  renderer: unknown,
): renderer is GpuPointCloudComputeRenderer {
  return (
    typeof renderer === "object" &&
    renderer !== null &&
    typeof (renderer as { compute?: unknown }).compute === "function"
  );
}

/** View and budget inputs for one cull. */
export interface GpuPointCloudComputeCullView {
  readonly camera: THREE.Camera;
  /** Samples eligible for culling (the full prepared payload prefix). */
  readonly candidateCount: number;
  /** Screen cell edge in drawing-buffer pixels. */
  readonly cellSizePx: number;
  /** Upper safety cap: the per-canvas budget allocated to this cloud. */
  readonly maxDrawCount: number;
  /** Object whose world matrix places the cloud's local positions. */
  readonly object: THREE.Object3D;
  readonly viewportHeightPx: number;
  readonly viewportWidthPx: number;
}

/** Compute-culled draw state bound into one cloud's draw and pick graphs. */
export interface GpuPointCloudComputeCull {
  /** Indirect args shared by the visible and pick sprite geometries. */
  readonly indirect: IndirectStorageBufferAttribute;
  /** Compacted canonical sample indices, one per drawn instance. */
  readonly visibleIndices: StorageBufferAttribute;
  dispose(): void;
  /** Forces the next `update` to dispatch (point data or counts changed). */
  markDirty(): void;
  /** Vertex-stage mapping: rendered instance -> canonical sample index. */
  sampleIndexNode(): GpuPointCloudSampleIndexNode;
  /** Dispatches when view or data changed. Returns whether it dispatched. */
  update(
    renderer: GpuPointCloudComputeRenderer,
    view: GpuPointCloudComputeCullView,
  ): boolean;
}

interface CullUniforms {
  readonly cellSize: PointCloudComputeUniformNode<number>;
  readonly gridSize: PointCloudComputeUniformNode<THREE.Vector2>;
  readonly maxDrawCount: PointCloudComputeUniformNode<number>;
  readonly modelViewProjection: PointCloudComputeUniformNode<THREE.Matrix4>;
  readonly viewport: PointCloudComputeUniformNode<THREE.Vector2>;
}

interface CullKernels {
  readonly claim: TSL.ComputeNode;
  readonly clear: TSL.ComputeNode;
  readonly compact: TSL.ComputeNode;
  readonly finalize: TSL.ComputeNode;
}

/**
 * Creates the cull buffers and kernels for one cloud. `owner` is the geometry
 * that already owns the cloud's storage attributes: Three releases GPU
 * buffers through geometry disposal, so the cull buffers are attached to it
 * under private names.
 */
export function createGpuPointCloudComputeCull({
  capacity,
  indexCount,
  owner,
  position,
}: {
  readonly capacity: number;
  /** Index count of the instanced sprite quad (arg 0 of the indirect draw). */
  readonly indexCount: number;
  readonly owner: THREE.BufferGeometry;
  readonly position: THREE.BufferAttribute;
}): GpuPointCloudComputeCull {
  const args = new Uint32Array(INDIRECT_ARG_COUNT);
  args[0] = indexCount;
  // instanceCount starts at 0: nothing draws until the first cull lands.
  const indirect = new IndirectStorageBufferAttribute(args, 1);
  const visibleIndices = new StorageBufferAttribute(
    new Uint32Array(Math.max(1, capacity)),
    1,
  );
  owner.setAttribute("pointCullIndirect", indirect);
  owner.setAttribute("pointCullVisible", visibleIndices);

  const uniforms: CullUniforms = {
    cellSize: computeTsl.uniform(1),
    gridSize: computeTsl.uniform(new THREE.Vector2(1, 1)),
    maxDrawCount: computeTsl.uniform(0),
    modelViewProjection: computeTsl.uniform(new THREE.Matrix4()),
    viewport: computeTsl.uniform(new THREE.Vector2(1, 1)),
  };

  let cells: StorageBufferAttribute | null = null;
  let kernels: CullKernels | null = null;
  let dirty = true;
  const signature = new Float64Array(VIEW_SIGNATURE_LENGTH);
  const nextSignature = new Float64Array(VIEW_SIGNATURE_LENGTH);
  const modelView = new THREE.Matrix4();

  const ensureCells = (cellCount: number): CullKernels => {
    if (cells && kernels && cells.count >= cellCount) return kernels;
    // Grow-only. DRAFT: the superseded cell buffer's GPU allocation leaks
    // until page teardown; releasing it needs a public BufferAttribute
    // dispose, which Three r185 lacks. Geometric growth keeps this rare.
    const allocated = Math.max(
      MIN_CELL_CAPACITY,
      cellCount,
      Math.ceil((cells?.count ?? 0) * CELL_BUFFER_GROWTH),
    );
    disposeKernels(kernels);
    cells = new StorageBufferAttribute(new Uint32Array(allocated), 1);
    owner.setAttribute("pointCullCells", cells);
    kernels = createCullKernels({
      args: indirect,
      cells,
      position,
      uniforms,
      visible: visibleIndices,
    });
    dirty = true;
    return kernels;
  };

  return {
    indirect,
    visibleIndices,
    dispose: () => {
      disposeKernels(kernels);
      kernels = null;
    },
    markDirty: () => {
      dirty = true;
    },
    sampleIndexNode: () => gpuPointCloudCulledSampleIndexNode(visibleIndices),
    update: (renderer, view) => {
      const width = Math.max(1, Math.floor(view.viewportWidthPx));
      const height = Math.max(1, Math.floor(view.viewportHeightPx));
      const cellSize = Math.max(1, Math.round(view.cellSizePx));
      const gridWidth = Math.ceil(width / cellSize);
      const gridHeight = Math.ceil(height / cellSize);
      const candidateCount = Math.min(
        normalizedCount(view.candidateCount),
        Math.floor(position.count / 3),
      );
      const maxDrawCount = Math.min(
        normalizedCount(view.maxDrawCount),
        visibleIndices.count,
      );

      view.camera.updateMatrixWorld();
      view.object.updateWorldMatrix(true, false);
      modelView.multiplyMatrices(
        view.camera.matrixWorldInverse,
        view.object.matrixWorld,
      );
      uniforms.modelViewProjection.value.multiplyMatrices(
        view.camera.projectionMatrix,
        modelView,
      );

      nextSignature.set(uniforms.modelViewProjection.value.elements, 0);
      nextSignature[16] = width;
      nextSignature[17] = height;
      nextSignature[18] = cellSize;
      nextSignature[19] = candidateCount;
      nextSignature[20] = maxDrawCount;
      if (!dirty && sameSignature(signature, nextSignature)) return false;

      const active = ensureCells(gridWidth * gridHeight);
      signature.set(nextSignature);
      dirty = false;

      uniforms.cellSize.value = cellSize;
      uniforms.gridSize.value.set(gridWidth, gridHeight);
      uniforms.maxDrawCount.value = maxDrawCount;
      uniforms.viewport.value.set(width, height);
      active.clear.count = Math.max(1, gridWidth * gridHeight);
      active.claim.count = candidateCount;
      active.compact.count = candidateCount;
      // One compute pass; WebGPU orders storage writes between dispatches.
      renderer.compute([
        active.clear,
        active.claim,
        active.compact,
        active.finalize,
      ]);
      return true;
    },
  };
}

function createCullKernels({
  args,
  cells,
  position,
  uniforms,
  visible,
}: {
  readonly args: IndirectStorageBufferAttribute;
  readonly cells: StorageBufferAttribute;
  readonly position: THREE.BufferAttribute;
  readonly uniforms: CullUniforms;
  readonly visible: StorageBufferAttribute;
}): CullKernels {
  const cellStore = computeTsl.storage(cells, "uint", cells.count).toAtomic();
  const argStore = computeTsl
    .storage(args, "uint", INDIRECT_ARG_COUNT)
    .toAtomic();
  const visibleStore = computeTsl.storage(visible, "uint", visible.count);
  const instanceCount = () =>
    argStore.element(computeTsl.uint(INDIRECT_INSTANCE_COUNT));

  const clear = computeTsl
    .Fn(() => {
      const index = computeTsl.uint(computeTsl.instanceIndex);
      computeTsl.atomicStore(
        cellStore.element(index),
        computeTsl.uint(UNCLAIMED_CELL),
      );
      computeTsl.If(index.equal(computeTsl.uint(0)), () => {
        computeTsl.atomicStore(instanceCount(), computeTsl.uint(0));
      });
    })()
    .compute(1);

  const claim = computeTsl
    .Fn(() => {
      const point = pointCell(position, uniforms);
      computeTsl.If(point.inside, () => {
        computeTsl.atomicMin(cellStore.element(point.cell), point.index);
      });
    })()
    .compute(1);

  const compact = computeTsl
    .Fn(() => {
      const point = pointCell(position, uniforms);
      computeTsl.If(point.inside, () => {
        const winner = computeTsl.atomicLoad(cellStore.element(point.cell));
        computeTsl.If(winner.equal(point.index), () => {
          const slot = computeTsl.atomicAdd(
            instanceCount(),
            computeTsl.uint(1),
          );
          // DRAFT: when survivors exceed the budget, which ones land below
          // the cap depends on dispatch order, not sample priority.
          computeTsl.If(
            slot.lessThan(computeTsl.uint(uniforms.maxDrawCount)),
            () => {
              visibleStore.element(slot).assign(point.index);
            },
          );
        });
      });
    })()
    .compute(1);

  const finalize = computeTsl
    .Fn(() => {
      const appended = computeTsl.atomicLoad(instanceCount());
      computeTsl.atomicStore(
        instanceCount(),
        computeTsl.min(appended, computeTsl.uint(uniforms.maxDrawCount)),
      );
    })()
    .compute(1);

  return { claim, clear, compact, finalize };
}

/**
 * Projects the current invocation's sample and names its screen cell. Built
 * inside each kernel so stack-scoped nodes stay local to that kernel.
 */
function pointCell(
  position: THREE.BufferAttribute,
  uniforms: CullUniforms,
): {
  readonly cell: PointCloudComputeNode;
  readonly index: PointCloudComputeNode;
  readonly inside: PointCloudComputeNode;
} {
  const index = computeTsl.uint(computeTsl.instanceIndex);
  const local = gpuPointCloudPositionNode(position, "flat", index);
  const clip = uniforms.modelViewProjection.mul(computeTsl.vec4(local, 1));
  const w = clip.w;
  // Frustum test in clip space. The near test is w > 0 so it holds for both
  // the WebGL [-w, w] and WebGPU [0, w] depth conventions.
  // DRAFT: cell winners are chosen by sample priority, not depth, so a far
  // sample can claim a cell in front of a nearer one.
  const inside = computeTsl.and(
    w.greaterThan(MIN_CLIP_W),
    clip.x.abs().lessThanEqual(w),
    clip.y.abs().lessThanEqual(w),
    clip.z.lessThanEqual(w),
  );
  const pixel = clip.xy.div(w).mul(0.5).add(0.5).mul(uniforms.viewport);
  const cellX = computeTsl.clamp(
    computeTsl.floor(pixel.x.div(uniforms.cellSize)),
    0,
    uniforms.gridSize.x.sub(1),
  );
  const cellY = computeTsl.clamp(
    computeTsl.floor(pixel.y.div(uniforms.cellSize)),
    0,
    uniforms.gridSize.y.sub(1),
  );
  const cell = computeTsl.uint(cellY.mul(uniforms.gridSize.x).add(cellX));
  return { cell, index, inside };
}

function disposeKernels(kernels: CullKernels | null): void {
  if (!kernels) return;
  kernels.clear.dispose();
  kernels.claim.dispose();
  kernels.compact.dispose();
  kernels.finalize.dispose();
}

function sameSignature(left: Float64Array, right: Float64Array): boolean {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function normalizedCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
