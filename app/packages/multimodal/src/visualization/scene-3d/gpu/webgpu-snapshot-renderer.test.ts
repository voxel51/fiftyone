import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PointCloudVisualization } from "../../../ir";

// The snapshot module reuses PointCloudSceneLayer's pure geometry builders,
// whose module also exports R3F components. Mock @react-three/fiber the way
// point-cloud.test.tsx does so jsdom never loads the real reconciler (which
// would double-load three).
vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn(),
  useThree: (selector: (state: { invalidate: () => void }) => unknown) =>
    selector({ invalidate: vi.fn() }),
}));
import {
  PERSPECTIVE_POINT_CAMERA,
  cameraPoseForBounds,
  sceneBoundsForLayers,
} from "../camera-fit-bounds";
import { buildPointCloudRenderData } from "../point-cloud-colors";
import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../../panel-ui/style-tokens";
import { DEFAULT_MAX_RENDERED_POINTS } from "../../webgpu/point-cloud-canvas-budget";
import {
  resetWebGpuDeviceRegistryForTests,
  webGpuDeviceStats,
} from "../../webgpu/webgpu-device-registry";
import {
  WEBGPU_SNAPSHOT_SURFACE,
  renderPointCloudSnapshot,
  resetWebGpuSnapshotRendererForTests,
  setWebGpuSnapshotBackendForTests,
  webGpuSnapshotRendererStats,
  type WebGpuSnapshotBackend,
} from "./webgpu-snapshot-renderer";

const LINGER_MS = 30_000;

let fake: ReturnType<typeof createFakeBackend>;

beforeEach(() => {
  resetWebGpuDeviceRegistryForTests();
  resetWebGpuSnapshotRendererForTests();
  fake = createFakeBackend();
  setWebGpuSnapshotBackendForTests(fake.backend);
});

afterEach(async () => {
  // Let any in-flight queue turns settle before tearing shared state down.
  await flushMicrotasks();
  resetWebGpuSnapshotRendererForTests();
  resetWebGpuDeviceRegistryForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("renderPointCloudSnapshot", () => {
  it("runs jobs strictly serially on one shared renderer", async () => {
    const first = renderPointCloudSnapshot(job());
    const second = renderPointCloudSnapshot(job());
    await flushMicrotasks();

    // One renderer, one in-flight render; the second job waits its turn.
    expect(fake.createRenderer).toHaveBeenCalledTimes(1);
    expect(fake.captures.length).toBe(1);

    const bitmapA = fakeBitmap();
    fake.captures[0].resolve(bitmapA);
    expect(await first).toBe(bitmapA);

    await flushMicrotasks();
    expect(fake.captures.length).toBe(2);
    const bitmapB = fakeBitmap();
    fake.captures[1].resolve(bitmapB);
    expect(await second).toBe(bitmapB);

    const stats = webGpuSnapshotRendererStats();
    expect(stats.jobsRun).toBe(2);
    expect(stats.jobsCancelled).toBe(0);
    expect(stats.jobsFailed).toBe(0);
    expect(stats.pendingJobs).toBe(0);
    expect(stats.rendererCreations).toBe(1);
  });

  it("drops an aborted queued job without rendering it", async () => {
    const first = renderPointCloudSnapshot(job());
    const controller = new AbortController();
    const second = renderPointCloudSnapshot(job({ signal: controller.signal }));
    await flushMicrotasks();

    controller.abort();
    fake.captures[0].resolve(fakeBitmap());
    await first;

    expect(await second).toBeNull();
    await flushMicrotasks();
    // The cancelled job never reached the renderer.
    expect(fake.captures.length).toBe(1);
    expect(webGpuSnapshotRendererStats().jobsCancelled).toBe(1);
    expect(webGpuSnapshotRendererStats().jobsRun).toBe(1);
  });

  it("closes the bitmap and resolves null when abort lands mid-render", async () => {
    const controller = new AbortController();
    const result = renderPointCloudSnapshot(job({ signal: controller.signal }));
    await flushMicrotasks();
    expect(fake.captures.length).toBe(1);

    controller.abort();
    const bitmap = fakeBitmap();
    fake.captures[0].resolve(bitmap);

    expect(await result).toBeNull();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(webGpuSnapshotRendererStats().jobsCancelled).toBe(1);
  });

  it('registers under "snapshot", lingers idle, then disposes and re-creates lazily', async () => {
    vi.useFakeTimers();

    const first = renderPointCloudSnapshot(job());
    await flushMicrotasks();
    // Live device visible to the registry while the renderer is warm.
    expect(webGpuDeviceStats().bySurface[WEBGPU_SNAPSHOT_SURFACE]).toBe(1);
    fake.captures[0].resolve(fakeBitmap());
    await first;
    expect(webGpuSnapshotRendererStats().rendererAlive).toBe(true);

    // Just short of the linger: still alive (bursts reuse the warm device).
    await vi.advanceTimersByTimeAsync(LINGER_MS - 1);
    expect(webGpuSnapshotRendererStats().rendererAlive).toBe(true);
    expect(fake.handles[0].dispose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fake.handles[0].dispose).toHaveBeenCalledTimes(1);
    expect(webGpuSnapshotRendererStats().rendererAlive).toBe(false);
    expect(webGpuSnapshotRendererStats().rendererDisposals).toBe(1);
    expect(
      webGpuDeviceStats().bySurface[WEBGPU_SNAPSHOT_SURFACE],
    ).toBeUndefined();

    // The next job re-creates the renderer from scratch.
    const second = renderPointCloudSnapshot(job());
    await flushMicrotasks();
    expect(fake.createRenderer).toHaveBeenCalledTimes(2);
    expect(webGpuDeviceStats().bySurface[WEBGPU_SNAPSHOT_SURFACE]).toBe(1);
    fake.captures[1].resolve(fakeBitmap());
    expect(await second).not.toBeNull();
    expect(webGpuSnapshotRendererStats().rendererCreations).toBe(2);
  });

  it("keeps the renderer alive when a job arrives inside the linger window", async () => {
    vi.useFakeTimers();

    const first = renderPointCloudSnapshot(job());
    await flushMicrotasks();
    fake.captures[0].resolve(fakeBitmap());
    await first;

    await vi.advanceTimersByTimeAsync(LINGER_MS - 1);
    const second = renderPointCloudSnapshot(job());
    await flushMicrotasks();
    fake.captures[1].resolve(fakeBitmap());
    await second;

    // The old deadline passed while the renderer was busy/re-lingered.
    await vi.advanceTimersByTimeAsync(LINGER_MS - 1);
    expect(webGpuSnapshotRendererStats().rendererAlive).toBe(true);
    expect(fake.createRenderer).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(webGpuSnapshotRendererStats().rendererAlive).toBe(false);
  });

  it("disposes per-job geometry and material before the job resolves", async () => {
    const result = renderPointCloudSnapshot(job());
    await flushMicrotasks();

    const capture = fake.captures[0];
    const points = findPoints(capture.scene);
    const sprite = findSprite(capture.scene);
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    const spriteMaterialDisposed = vi.fn();
    points.geometry.addEventListener("dispose", geometryDisposed);
    (points.material as THREE.Material).addEventListener(
      "dispose",
      materialDisposed,
    );
    (sprite.material as THREE.Material).addEventListener(
      "dispose",
      spriteMaterialDisposed,
    );

    capture.resolve(fakeBitmap());
    await result;

    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(1);
    expect(sprite.count).toBe(pointCloudFrame().pointCount);
    expect(spriteMaterialDisposed).toHaveBeenCalledTimes(1);
  });

  it("builds the scene with the live panel's builders and honors an explicit pose", async () => {
    const frame = pointCloudFrame();
    const pose = {
      position: [10, 20, 30] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
    };
    const result = renderPointCloudSnapshot(
      job({
        cameraPose: pose,
        height: 32.4,
        layers: layersFor(frame),
        width: 63.6,
      }),
    );
    await flushMicrotasks();

    const capture = fake.captures[0];
    // Pixel sizes are rounded and clamped before reaching the renderer.
    expect(capture.width).toBe(64);
    expect(capture.height).toBe(32);

    const { camera, scene } = capture;
    expect([camera.position.x, camera.position.y, camera.position.z]).toEqual(
      pose.position,
    );
    // Z-up, matching the live scene's default up axis.
    expect([camera.up.x, camera.up.y, camera.up.z]).toEqual([0, 0, 1]);
    expect(camera.aspect).toBe(2);
    expect(camera.fov).toBe(PERSPECTIVE_POINT_CAMERA.fov);
    expect((scene.background as THREE.Color).getHexString()).toBe(
      new THREE.Color(VISUALIZATION_PANEL_BACKGROUND_COLOR).getHexString(),
    );

    // Geometry content matches the shared pure builder byte-for-byte.
    const expected = buildPointCloudRenderData(
      frame.positions,
      DEFAULT_MAX_RENDERED_POINTS,
      {},
    );
    const points = findPoints(scene);
    const positionAttribute = points.geometry.getAttribute("position");
    expect(Array.from(positionAttribute.array as Float32Array)).toEqual(
      Array.from(expected.positions),
    );
    expect(points.geometry.drawRange.count).toBe(expected.renderedPointCount);

    capture.resolve(fakeBitmap());
    await result;
  });

  it("auto-fits with the live panel's fit math when the pose is null", async () => {
    const frame = pointCloudFrame();
    const result = renderPointCloudSnapshot(
      job({
        cameraPose: null,
        height: 64,
        layers: layersFor(frame),
        width: 32,
      }),
    );
    await flushMicrotasks();

    const layer = { frame, id: "preview" };
    const expectedPose = cameraPoseForBounds(
      sceneBoundsForLayers(
        [
          {
            data: buildPointCloudRenderData(
              frame.positions,
              DEFAULT_MAX_RENDERED_POINTS,
              {},
            ),
            layer,
          },
        ],
        [],
      ),
      PERSPECTIVE_POINT_CAMERA.fov,
      0.5,
    );
    const { camera } = fake.captures[0];
    if (!expectedPose) {
      throw new Error("expected an auto-fit pose for a non-empty cloud");
    }
    expect(camera.position.x).toBeCloseTo(expectedPose.position[0]);
    expect(camera.position.y).toBeCloseTo(expectedPose.position[1]);
    expect(camera.position.z).toBeCloseTo(expectedPose.position[2]);

    fake.captures[0].resolve(fakeBitmap());
    await result;
  });

  it("recovers from a failed renderer creation and releases the registration", async () => {
    const failingOnce = createFakeBackend();
    failingOnce.failNextCreate(new Error("no adapter"));
    setWebGpuSnapshotBackendForTests(failingOnce.backend);

    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    expect(await renderPointCloudSnapshot(job())).toBeNull();
    expect(consoleWarn).toHaveBeenCalled();
    expect(webGpuSnapshotRendererStats().jobsFailed).toBe(1);
    // The failed device registration is released, not leaked.
    expect(
      webGpuDeviceStats().bySurface[WEBGPU_SNAPSHOT_SURFACE],
    ).toBeUndefined();

    // The next job retries creation instead of inheriting the rejection.
    const second = renderPointCloudSnapshot(job());
    await flushMicrotasks();
    expect(failingOnce.createRenderer).toHaveBeenCalledTimes(2);
    failingOnce.captures[0].resolve(fakeBitmap());
    expect(await second).not.toBeNull();
  });
});

function job(
  overrides: Partial<Parameters<typeof renderPointCloudSnapshot>[0]> = {},
): Parameters<typeof renderPointCloudSnapshot>[0] {
  return {
    height: 32,
    layers: layersFor(pointCloudFrame()),
    width: 64,
    ...overrides,
  };
}

function layersFor(frame: PointCloudVisualization) {
  return [{ frame, id: "preview" }];
}

function pointCloudFrame(): PointCloudVisualization {
  return {
    fields: [],
    kind: "point-cloud",
    pointCount: 3,
    positions: new Float32Array([0, 0, 0, 4, 0, 1, 2, 3, 5]),
  } as unknown as PointCloudVisualization;
}

interface FakeCapture {
  readonly camera: THREE.PerspectiveCamera;
  readonly height: number;
  readonly reject: (error: unknown) => void;
  readonly resolve: (bitmap: ImageBitmap) => void;
  readonly scene: THREE.Scene;
  readonly width: number;
}

function createFakeBackend() {
  const captures: FakeCapture[] = [];
  const handles: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
  let failNext: Error | null = null;

  const createRenderer = vi.fn(async () => {
    if (failNext) {
      const error = failNext;
      failNext = null;
      throw error;
    }

    const handle = {
      dispose: vi.fn(),
      renderAndCapture: (
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        width: number,
        height: number,
      ) =>
        new Promise<ImageBitmap>((resolve, reject) => {
          captures.push({ camera, height, reject, resolve, scene, width });
        }),
    };
    handles.push(handle);
    return handle;
  });

  const backend: WebGpuSnapshotBackend = { createRenderer };

  return {
    backend,
    captures,
    createRenderer,
    failNextCreate: (error: Error) => {
      failNext = error;
    },
    handles,
  };
}

function fakeBitmap(width = 4, height = 4): ImageBitmap {
  return { close: vi.fn(), height, width } as unknown as ImageBitmap;
}

function findPoints(scene: THREE.Scene): THREE.Points {
  let found: THREE.Points | null = null;
  scene.traverse((object) => {
    if ((object as THREE.Points).isPoints) {
      found = object as THREE.Points;
    }
  });
  if (!found) {
    throw new Error("no Points object in snapshot scene");
  }
  return found;
}

function findSprite(scene: THREE.Scene): THREE.Sprite {
  let found: THREE.Sprite | null = null;
  scene.traverse((object) => {
    if ((object as THREE.Sprite).isSprite) {
      found = object as THREE.Sprite;
    }
  });
  if (!found) {
    throw new Error("no Sprite object in snapshot scene");
  }
  return found;
}

async function flushMicrotasks(turns = 12): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}
