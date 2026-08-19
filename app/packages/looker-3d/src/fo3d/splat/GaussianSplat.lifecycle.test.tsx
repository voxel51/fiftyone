import { act, render, waitFor } from "@testing-library/react";
import { Color, Quaternion, Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GaussianSplatAsset } from "../render-types";
import { GaussianSplat } from "./GaussianSplat";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  loadSpark: vi.fn(),
  loaderCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@fiftyone/state", () => ({
  getSampleSrc: (path: string) => path,
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) =>
    selector({ invalidate: mocks.invalidate }),
}));

vi.mock("../../hooks/use-fo-loaders", () => ({
  configureFoLoaderInstance: vi.fn(),
}));

vi.mock("../../hooks/use-splat-appearance-controls", () => ({
  useSplatAppearanceControls: ({
    defaultOpacity,
    defaultTint,
  }: {
    defaultOpacity: number;
    defaultTint: string;
  }) => ({ opacity: defaultOpacity, tint: defaultTint }),
}));

vi.mock("../../hooks/use-splat-settings", () => ({
  useSplatSettings: () => [
    { detail: "low", maxSh: 0, sharpness: 1, sorting: "stable" },
  ],
}));

vi.mock("../context", () => ({
  useFo3dContext: () => ({ fo3dRoot: null, loadingManager: undefined }),
}));

vi.mock("../utils", () => ({
  getResolvedUrlForFo3dAsset: (path: string) => path,
}));

vi.mock("./load-spark", () => ({
  loadSpark: mocks.loadSpark,
}));

vi.mock("./SparkRendererRoot", () => ({
  useSparkRenderer: vi.fn(),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

class FakePackedSplats {
  dispose = vi.fn();
  getNumSplats = () => 0;
  lodSplats = undefined;
}

class FakeExtSplats extends FakePackedSplats {}

class FakeSplatMesh {
  static instances: FakeSplatMesh[] = [];

  dispose: ReturnType<typeof vi.fn>;
  extSplats?: FakeExtSplats;
  initialized = Promise.resolve();
  maxSh = 0;
  opacity = 1;
  packedSplats?: FakePackedSplats;
  recolor = new Color();
  updateGenerator = vi.fn();

  constructor({
    extSplats,
    packedSplats,
  }: {
    extSplats?: FakeExtSplats;
    packedSplats?: FakePackedSplats;
  }) {
    this.extSplats = extSplats;
    this.packedSplats = packedSplats;
    this.dispose = vi.fn(() => {
      this.extSplats?.dispose();
      this.packedSplats?.dispose();
    });
    FakeSplatMesh.instances.push(this);
  }

  getBoundingBox = () => ({
    getCenter: (target: Vector3) => target.set(0, 0, 0),
    isEmpty: () => true,
  });
}

let pendingLoad: ReturnType<typeof deferred<void>> | null = null;

class FakeSplatLoader {
  async loadInternalAsync(options: Record<string, unknown>) {
    mocks.loaderCalls.push(options);
    await pendingLoad?.promise;
  }
}

const buildAsset = (splatPath: string) =>
  ({
    centerGeometry: true,
    format: "spz",
    opacity: 1,
    splatPath,
    tint: "#ffffff",
  }) as GaussianSplatAsset;

const renderSplat = (splatPath: string) => (
  <GaussianSplat
    name="reconstruction"
    splat={buildAsset(splatPath)}
    position={new Vector3()}
    quaternion={new Quaternion()}
    scale={new Vector3(1, 1, 1)}
  />
);

beforeEach(() => {
  vi.clearAllMocks();
  FakeSplatMesh.instances = [];
  mocks.loaderCalls.length = 0;
  pendingLoad = null;
  mocks.loadSpark.mockResolvedValue({
    ExtSplats: FakeExtSplats,
    PackedSplats: FakePackedSplats,
    SplatLoader: FakeSplatLoader,
    SplatMesh: FakeSplatMesh,
  });
});

describe("GaussianSplat lifecycle", () => {
  it("removes and disposes the previous mesh when its source changes", async () => {
    const view = render(renderSplat("first.spz"));

    await waitFor(() => expect(FakeSplatMesh.instances).toHaveLength(1));
    const firstMesh = FakeSplatMesh.instances[0];

    view.rerender(renderSplat("second.spz"));

    await waitFor(() => expect(firstMesh.dispose).toHaveBeenCalledOnce());
    await waitFor(() => expect(FakeSplatMesh.instances).toHaveLength(2));
    expect(FakeSplatMesh.instances[1].dispose).not.toHaveBeenCalled();
  });

  it("disposes decoded data when Spark finishes after unmount", async () => {
    pendingLoad = deferred<void>();
    const view = render(renderSplat("slow.spz"));

    await waitFor(() => expect(mocks.loaderCalls).toHaveLength(1));
    const decoded = mocks.loaderCalls[0].packedSplats as FakePackedSplats;
    view.unmount();

    await act(async () => pendingLoad?.resolve());

    await waitFor(() => expect(decoded.dispose).toHaveBeenCalledOnce());
    expect(FakeSplatMesh.instances).toHaveLength(0);
  });
});
