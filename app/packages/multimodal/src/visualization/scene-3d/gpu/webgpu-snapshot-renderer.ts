/**
 * Shared offscreen WebGPU snapshot renderer. Renders a point-cloud scene
 * ONCE at a requested pixel size and returns an `ImageBitmap`, so at-rest
 * grid preview cells can show a static bitmap instead of each holding a
 * live `WebGPURenderer` + `GPUDevice` (the per-cell device zoo this
 * replaces scaled with visible cells; this subsystem costs exactly one
 * device while warm and zero after the idle linger).
 *
 * Mechanics are spike-proven (see grid-mcap-optimization.md, "Spike
 * report"): `OffscreenCanvas.transferToImageBitmap()` captures the frame
 * when called in the SAME task as the awaited `renderAsync`, one renderer
 * serially reuses across scenes and sizes, and steady-state cost is
 * ~2-3 ms per 256^2 snapshot. Same-task capture is kept as the coding
 * discipline here even though Chromium retains detached-OffscreenCanvas
 * frames across task boundaries.
 *
 * Scene construction reuses the SAME pure builders as the live panel
 * (`buildPointCloudRenderData`, `createPointCloudGeometry`,
 * `applyPointCloudData`, `pointCloudObjectTransform`, and the
 * `camera-fit-bounds` fit math), so a snapshot at a given pose is
 * pixel-equivalent to what the live `PointCloudPanel` would present —
 * hover swaps between bitmap and live canvas must not jump.
 *
 * Layering: generic visualization machinery — no adapters/ imports
 * (dependency-cruiser enforces it). jsdom has neither WebGPU nor
 * `OffscreenCanvas`, so the render backend is injectable for unit tests
 * (same seam style as `image-texture-cache`'s injectable decode); the
 * real path is covered by the spike/probe methodology, not jsdom.
 */
import * as THREE from "three";

import {
  PERSPECTIVE_POINT_CAMERA,
  cameraPoseForBounds,
  sceneBoundsForLayers,
} from "../camera-fit-bounds";
import {
  DEFAULT_MAX_RENDERED_POINTS,
  POINT_COMPONENT_COUNT,
  buildPointCloudRenderData,
} from "../point-cloud-colors";
import {
  DEFAULT_POINT_SIZE,
  POINT_CLOUD_POINTS_MATERIAL_PROPS,
  WEBGPU_POINT_PRIMITIVE_SIZE_PX,
  applyPointCloudInstanceData,
  applyPointCloudData,
  createPointCloudGeometry,
  createPointCloudInstanceAttributes,
  createPointCloudSpriteMaterial,
} from "../PointCloudSceneLayer";
import { pointCloudObjectTransform } from "../transforms";
import type {
  PointCloudCameraPose,
  PointCloudColorBy,
  PointCloudPanelLayer,
  PointCloudRenderLayer,
} from "../types";
import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../../panel-ui/style-tokens";
import {
  registerWebGpuRenderer,
  type WebGpuRendererRegistration,
} from "../../webgpu/webgpu-device-registry";

/** Device-registry surface tag for the shared snapshot renderer. */
export const WEBGPU_SNAPSHOT_SURFACE = "snapshot";

/**
 * Idle linger before the renderer (and its GPUDevice) is disposed. The
 * first readback on a fresh renderer cost up to ~430 ms in the spike
 * (one-time pipeline/shader warmup), so bursts of snapshots — scrolls,
 * shared-pose orbits re-snapshotting every visible cell — must reuse one
 * warm renderer instead of paying warmup (and device create/destroy
 * churn) per burst.
 */
const SNAPSHOT_RENDERER_LINGER_MS = 30_000;

/**
 * One snapshot request. `layers` carries the same
 * `{frame, frameTransform, id}` layer shape the live `PointCloudPanel`
 * consumes, so callers hand over exactly what they would have rendered
 * live.
 */
export interface PointCloudSnapshotJob {
  /**
   * Pose to render from. `null`/omitted = auto-fit via the live panel's
   * fit math, matching what an uncontrolled panel would show initially.
   */
  readonly cameraPose?: PointCloudCameraPose | null;
  /** Scene background. Defaults to the shared panel background token. */
  readonly clearColor?: THREE.ColorRepresentation;
  readonly colorBy?: PointCloudColorBy;
  /** Snapshot pixel height (clamped >= 1). */
  readonly height: number;
  readonly layers: readonly PointCloudPanelLayer[];
  readonly maxRenderedPoints?: number;
  readonly pointSize?: number;
  /**
   * Cancels the job: an aborted job resolves `null` WITHOUT rendering
   * (or closes its bitmap if abort lands after capture), so fast scrolls
   * can drop stale queued jobs cheaply.
   */
  readonly signal?: AbortSignal;
  /** Snapshot pixel width (clamped >= 1). */
  readonly width: number;
}

/**
 * Minimal renderer surface the queue needs. The real handle wraps a
 * `THREE.WebGPURenderer` on an `OffscreenCanvas`; tests inject fakes.
 */
export interface WebGpuSnapshotRendererHandle {
  dispose(): void;
  /**
   * Renders `scene` once at `width`x`height` and captures the frame.
   * Capture must happen in the same task as the awaited render (spike
   * discipline).
   */
  renderAndCapture(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ): Promise<ImageBitmap>;
}

/** Injectable factory for the renderer handle. */
export interface WebGpuSnapshotBackend {
  createRenderer(): Promise<WebGpuSnapshotRendererHandle>;
}

/** Counters for tests and probes. */
export interface WebGpuSnapshotRendererStats {
  readonly jobsCancelled: number;
  readonly jobsFailed: number;
  readonly jobsRun: number;
  readonly pendingJobs: number;
  readonly rendererAlive: boolean;
  readonly rendererCreations: number;
  readonly rendererDisposals: number;
}

const realBackend: WebGpuSnapshotBackend = {
  async createRenderer() {
    // three/webgpu is imported lazily: its module scope touches WebGPU
    // globals (GPUShaderStage) that only exist in real browsers, and only
    // this real backend — never the jsdom fakes — needs it.
    const { WebGPURenderer } = await import("three/webgpu");
    // OffscreenCanvas on purpose — the spike's T5 proved the DOM-canvas
    // path silently returns transparent-black bitmaps once the compositor
    // consumes the frame. Initial size is irrelevant; every job sets its
    // own size.
    const canvas = new OffscreenCanvas(1, 1);
    // Same construction parameters as `WebGpuCanvas.tsx`'s renderer so
    // snapshot output matches the live panels (antialias, opaque, sRGB).
    const renderer = new WebGPURenderer({
      alpha: false,
      antialias: true,
      canvas: canvas as unknown as HTMLCanvasElement,
      depth: true,
      powerPreference: "high-performance",
      stencil: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    await renderer.init();

    return {
      dispose() {
        renderer.dispose();
      },
      async renderAndCapture(scene, camera, width, height) {
        // setSize lives on the common Renderer base, which the resolved
        // types don't surface (same cast as WebGpuCanvas.tsx). Sizes are
        // pre-clamped >= 1 by the queue — a zero-size swapchain poisons
        // every later command buffer.
        (
          renderer as unknown as {
            setSize(w: number, h: number, updateStyle?: boolean): void;
          }
        ).setSize(width, height, false);
        await renderer.renderAsync(scene, camera);
        // Same-task capture, immediately after the awaited render.
        return canvas.transferToImageBitmap();
      },
    };
  },
};

let activeBackend: WebGpuSnapshotBackend = realBackend;
let rendererPromise: Promise<WebGpuSnapshotRendererHandle> | null = null;
let registration: WebGpuRendererRegistration | null = null;
let queueTail: Promise<unknown> = Promise.resolve();
let pendingJobs = 0;
let lingerTimer: ReturnType<typeof setTimeout> | null = null;
let jobsCancelled = 0;
let jobsFailed = 0;
let jobsRun = 0;
let rendererCreations = 0;
let rendererDisposals = 0;

/**
 * Enqueues one snapshot. Jobs run strictly serially on the shared
 * renderer (the spike's proven reuse pattern); a job aborted before its
 * turn resolves `null` without touching the renderer. Failures also
 * resolve `null` — the caller keeps its previous bitmap, mirroring the
 * "never blank on error" discipline of the bitmap host.
 */
export function renderPointCloudSnapshot(
  job: PointCloudSnapshotJob,
): Promise<ImageBitmap | null> {
  pendingJobs += 1;
  cancelLinger();
  const result = queueTail.then(() => runJob(job));
  // The tail must survive any job outcome; runJob never rejects, but
  // guard anyway so one anomaly cannot wedge the queue forever.
  queueTail = result.catch(() => undefined);
  return result;
}

/** Current queue/renderer counters as a plain snapshot. */
export function webGpuSnapshotRendererStats(): WebGpuSnapshotRendererStats {
  return {
    jobsCancelled,
    jobsFailed,
    jobsRun,
    pendingJobs,
    rendererAlive: rendererPromise !== null,
    rendererCreations,
    rendererDisposals,
  };
}

/**
 * Replaces the render backend (jsdom tests inject fakes; `null` restores
 * the real OffscreenCanvas backend). Takes effect on the NEXT renderer
 * creation — call `resetWebGpuSnapshotRendererForTests()` first if a
 * renderer is already alive.
 */
export function setWebGpuSnapshotBackendForTests(
  backend: WebGpuSnapshotBackend | null,
): void {
  activeBackend = backend ?? realBackend;
}

/**
 * Disposes any live renderer, clears the queue chain and counters, and
 * restores the real backend. Tests only; callers should let outstanding
 * jobs settle first.
 */
export function resetWebGpuSnapshotRendererForTests(): void {
  cancelLinger();
  disposeRenderer();
  activeBackend = realBackend;
  queueTail = Promise.resolve();
  pendingJobs = 0;
  jobsCancelled = 0;
  jobsFailed = 0;
  jobsRun = 0;
  rendererCreations = 0;
  rendererDisposals = 0;
}

async function runJob(job: PointCloudSnapshotJob): Promise<ImageBitmap | null> {
  try {
    if (job.signal?.aborted) {
      jobsCancelled += 1;
      return null;
    }

    const renderer = await acquireRenderer();
    // Re-check after the (possibly slow, warmup-priced) renderer
    // creation: a job cancelled while waiting must not render.
    if (job.signal?.aborted) {
      jobsCancelled += 1;
      return null;
    }

    const width = Math.max(1, Math.round(job.width));
    const height = Math.max(1, Math.round(job.height));
    const { camera, disposables, scene } = buildSnapshotScene(
      job,
      width,
      height,
    );
    try {
      const bitmap = await renderer.renderAndCapture(
        scene,
        camera,
        width,
        height,
      );
      if (job.signal?.aborted) {
        // Abort landed mid-render: the frame is already paid for, but the
        // caller is gone — release the bitmap instead of leaking it.
        bitmap.close();
        jobsCancelled += 1;
        return null;
      }

      jobsRun += 1;
      return bitmap;
    } finally {
      // Every per-job GPU resource dies before the job resolves; only the
      // renderer itself persists (until the idle linger).
      for (const disposable of disposables) {
        disposable.dispose();
      }
    }
  } catch (error) {
    jobsFailed += 1;
    console.warn("[webgpu-snapshot-renderer] snapshot job failed", error);
    return null;
  } finally {
    pendingJobs -= 1;
    if (pendingJobs === 0) {
      scheduleLinger();
    }
  }
}

function acquireRenderer(): Promise<WebGpuSnapshotRendererHandle> {
  if (!rendererPromise) {
    rendererCreations += 1;
    // Register while the device is being acquired so the registry never
    // undercounts a live device; released wherever the renderer dies.
    registration = registerWebGpuRenderer(WEBGPU_SNAPSHOT_SURFACE);
    const creation = activeBackend.createRenderer();
    rendererPromise = creation;
    creation.catch(() => {
      // A failed creation must not poison later jobs: drop the rejected
      // promise so the next job retries, and release the registration.
      if (rendererPromise === creation) {
        rendererPromise = null;
        registration?.release();
        registration = null;
      }
    });
  }

  return rendererPromise;
}

function scheduleLinger(): void {
  cancelLinger();
  if (!rendererPromise) {
    return;
  }

  lingerTimer = setTimeout(disposeRenderer, SNAPSHOT_RENDERER_LINGER_MS);
}

function cancelLinger(): void {
  if (lingerTimer !== null) {
    clearTimeout(lingerTimer);
    lingerTimer = null;
  }
}

function disposeRenderer(): void {
  const current = rendererPromise;
  if (!current) {
    return;
  }

  rendererPromise = null;
  const currentRegistration = registration;
  registration = null;
  current.then(
    (handle) => {
      handle.dispose();
      rendererDisposals += 1;
      currentRegistration?.release();
    },
    () => {
      currentRegistration?.release();
    },
  );
}

function buildSnapshotScene(
  job: PointCloudSnapshotJob,
  width: number,
  height: number,
): {
  camera: THREE.PerspectiveCamera;
  disposables: readonly { dispose(): void }[];
  scene: THREE.Scene;
} {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(
    job.clearColor ?? VISUALIZATION_PANEL_BACKGROUND_COLOR,
  );

  const disposables: { dispose(): void }[] = [];
  const renderLayers: PointCloudRenderLayer[] = job.layers.map((layer) => ({
    data: buildPointCloudRenderData(
      layer.frame.positions,
      job.maxRenderedPoints ?? DEFAULT_MAX_RENDERED_POINTS,
      {
        colorBy: job.colorBy,
        colors: layer.frame.colors,
        scalarFields: layer.frame.scalarFields,
      },
    ),
    layer,
  }));

  for (const { data, layer } of renderLayers) {
    // Capacity must cover the FULL render-data arrays (applyPointCloudData
    // copies them whole); mirrors the live layer's required-points math.
    const capacityPoints = Math.ceil(
      data.positions.length / POINT_COMPONENT_COUNT,
    );
    const geometry = createPointCloudGeometry(capacityPoints);
    applyPointCloudData(geometry, data);
    const pointSize = job.pointSize ?? DEFAULT_POINT_SIZE;
    // Same material parameters as PointCloudSceneLayer's <pointsMaterial>.
    // No lights in the scene on purpose: PointsMaterial is unlit.
    const material = new THREE.PointsMaterial({
      ...POINT_CLOUD_POINTS_MATERIAL_PROPS,
      size: pointSize,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;

    const transform = pointCloudObjectTransform(layer.frameTransform);
    const group = new THREE.Group();
    group.position.set(...transform.position);
    group.quaternion.set(...transform.quaternion);
    group.add(points);
    if (pointSize > WEBGPU_POINT_PRIMITIVE_SIZE_PX) {
      const attributes = createPointCloudInstanceAttributes(capacityPoints);
      applyPointCloudInstanceData(attributes, data);
      const spriteMaterial = createPointCloudSpriteMaterial(
        attributes,
        pointSize,
      );
      const sprite = new THREE.Sprite(
        spriteMaterial as unknown as THREE.SpriteMaterial,
      );
      sprite.count = data.renderedPointCount;
      sprite.frustumCulled = false;
      group.add(sprite);
      disposables.push(spriteMaterial);
    }
    scene.add(group);
    disposables.push(geometry, material);
  }

  // Auto-fit reuses the live panel's exact fit math so a pose-less
  // snapshot matches what an uncontrolled live panel would first show.
  const pose =
    job.cameraPose ??
    cameraPoseForBounds(
      sceneBoundsForLayers(renderLayers, []),
      PERSPECTIVE_POINT_CAMERA.fov,
      width / height,
    );
  const camera = new THREE.PerspectiveCamera(
    PERSPECTIVE_POINT_CAMERA.fov,
    width / height,
    PERSPECTIVE_POINT_CAMERA.near,
    PERSPECTIVE_POINT_CAMERA.far,
  );
  // Snapshots pin Z-up; the live Base3dScene resolves its up axis per scene
  // via useSceneUpCoordinates.
  camera.up.set(0, 0, 1);
  if (pose) {
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
  } else {
    camera.position.set(...PERSPECTIVE_POINT_CAMERA.position);
    camera.lookAt(0, 0, 0);
  }
  camera.updateProjectionMatrix();

  return { camera, disposables, scene };
}
