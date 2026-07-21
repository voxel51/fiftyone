import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

import {
  buildPointCloudRenderPayload,
  type PointCloudVisualization,
} from "../../../decoders";
import { VISUALIZATION_KIND } from "../../../visualization/visualization-registry";
import type { PointerDwellOptions } from "../../../visualization/shared/pointer-dwell";
import type { GpuPointCloudProjectionPickerHandle } from "../../../visualization/webgpu/gpu-point-cloud-projection-picker";
import { gpuPointCloudProjectionResourceKey } from "../../../visualization/webgpu/gpu-point-cloud-projection";
import EpisodeImageProjectionOverlay from "./EpisodeImageProjectionOverlay";
import type { EpisodeImageProjectionLayer } from "./use-episode-image-projection-layers";
import type { EpisodeCameraModel } from "./camera-geometry/episode-camera-model";

const mocks = vi.hoisted(() => ({
  dwell: null as PointerDwellOptions | null,
  setHover: vi.fn(),
}));

vi.mock("../../../visualization/shared/pointer-dwell", () => ({
  attachPointerDwell: (_element: HTMLElement, options: PointerDwellOptions) => {
    mocks.dwell = options;
    return vi.fn();
  },
}));

vi.mock("./episode-hover-echo", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./episode-hover-echo")>();
  return { ...original, useSetEpisodeHoverEcho: () => mocks.setHover };
});

beforeEach(() => {
  mocks.dwell = null;
  mocks.setHover.mockReset();
});

afterEach(() => cleanup());

describe("EpisodeImageProjectionOverlay", () => {
  it("maps a GPU sample result to decoded tooltip and hover state", async () => {
    const layer = projectionLayer();
    const resourceKey = gpuPointCloudProjectionResourceKey(
      "recording",
      layer.stream,
      layer.contentTimeNs,
    );
    const picker = pickerHandle(
      Promise.resolve({
        layerIndex: 0,
        resourceKey,
        sampleIndex: 0,
        sourceIndex: 0,
      }),
    );
    const { container } = renderOverlay(layer, picker);
    mockOverlayBounds(container);

    act(() => mocks.dwell?.onDwell(210, 170));

    await waitFor(() => expect(picker.pick).toHaveBeenCalledOnce());
    expect(picker.pick).toHaveBeenCalledWith({
      radiusPx: 6,
      targetU: 200,
      targetV: 150,
    });
    await waitFor(() =>
      expect(mocks.setHover).toHaveBeenCalledWith({
        color: [1, 0, 0],
        kind: "point",
        pointIndex: 0,
        position: [1, 2, 3],
        stream: "/lidar",
      }),
    );
    expect(screen.getByTestId("episode-3d-hover-tooltip")).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("suppresses a readback invalidated by pointer movement", async () => {
    const pending = deferred<{
      layerIndex: number;
      resourceKey: string;
      sampleIndex: number;
      sourceIndex: number;
    } | null>();
    const layer = projectionLayer();
    const picker = pickerHandle(pending.promise);
    const { container } = renderOverlay(layer, picker);
    mockOverlayBounds(container);

    act(() => mocks.dwell?.onDwell(210, 170));
    act(() => mocks.dwell?.onCancel());
    pending.resolve({
      layerIndex: 0,
      resourceKey: gpuPointCloudProjectionResourceKey(
        "recording",
        layer.stream,
        layer.contentTimeNs,
      ),
      sampleIndex: 0,
      sourceIndex: 0,
    });
    await act(async () => pending.promise);

    expect(picker.invalidate).toHaveBeenCalled();
    expect(
      mocks.setHover.mock.calls.some(
        ([value]) => typeof value === "object" && value?.kind === "point",
      ),
    ).toBe(false);
  });
});

function renderOverlay(
  layer: EpisodeImageProjectionLayer,
  picker: GpuPointCloudProjectionPickerHandle,
) {
  return render(
    <div>
      <EpisodeImageProjectionOverlay
        cameraModel={cameraModel()}
        fit="contain"
        imageHeight={300}
        imageWidth={400}
        layers={[layer]}
        pickerRef={{ current: picker }}
        pointSize={2}
        sourceKey="recording"
      />
    </div>,
  );
}

function mockOverlayBounds(container: HTMLElement) {
  const overlay = container.querySelector(
    "[data-episode-image-projection-overlay]",
  );
  if (!(overlay instanceof HTMLElement)) {
    throw new Error("Expected projection interaction overlay");
  }
  overlay.getBoundingClientRect = () =>
    ({
      bottom: 320,
      height: 300,
      left: 10,
      right: 410,
      top: 20,
      width: 400,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }) as DOMRect;
}

function pickerHandle(
  result: Promise<{
    layerIndex: number;
    resourceKey: string;
    sampleIndex: number;
    sourceIndex: number;
  } | null>,
): GpuPointCloudProjectionPickerHandle & {
  invalidate: Mock<GpuPointCloudProjectionPickerHandle["invalidate"]>;
  pick: Mock<GpuPointCloudProjectionPickerHandle["pick"]>;
} {
  return {
    invalidate: vi.fn(),
    pick: vi.fn<GpuPointCloudProjectionPickerHandle["pick"]>(() => result),
  };
}

function projectionLayer(): EpisodeImageProjectionLayer {
  const positions = new Float32Array([1, 2, 3]);
  const payload = buildPointCloudRenderPayload({ positions });
  const frame: PointCloudVisualization = {
    coordinateFrameId: "lidar",
    fields: [],
    kind: VISUALIZATION_KIND.POINT_CLOUD,
    pointCount: 1,
    positions,
    renderPayload: payload,
    scalarFields: [{ name: "intensity", values: new Float32Array([0.5]) }],
  };
  return {
    colorOptions: { colorBy: "uniform", uniformColor: "#ff0000" },
    contentTimeNs: 42n,
    frame,
    payload,
    rotation: { w: 1, x: 0, y: 0, z: 0 },
    stream: "/lidar",
    translation: { x: 0, y: 0, z: 0 },
  };
}

function cameraModel(): EpisodeCameraModel {
  return {
    height: 300,
    kind: "pinhole",
    projection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    rectification: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    space: "original",
    width: 400,
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
