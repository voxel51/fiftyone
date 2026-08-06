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

import { buildPointCloudRenderPayload } from "../../../ir";
import type { PointCloudVisualization } from "../../../ir";
import { VISUALIZATION_KIND } from "../../../visualization/visualization-registry";
import type { PointerDwellOptions } from "../../../visualization/interaction/pointer-dwell";
import type { GpuPointCloudProjectionPickerHandle } from "../../../visualization/composition/GpuPointCloudProjectionPicker";
import { gpuPointCloudProjectionResourceKey } from "../../../visualization/composition/gpu-point-cloud-projection";
import ImageProjectionOverlay from "./ImageProjectionOverlay";
import type { ImageProjectionLayer } from "./use-image-projection-layers";
import type { CameraModel } from "../spatial/camera-geometry/camera-model";

const mocks = vi.hoisted(() => ({
  dwell: null as PointerDwellOptions | null,
  owned: new Map<string, unknown>(),
  publisher: {
    disownAll: vi.fn(),
    publish: vi.fn(),
    retract: vi.fn(),
    retire: vi.fn(),
  },
}));

vi.mock("../../../visualization/interaction/pointer-dwell", () => ({
  attachPointerDwell: (_element: HTMLElement, options: PointerDwellOptions) => {
    mocks.dwell = options;
    return vi.fn();
  },
}));

vi.mock("../interaction/point-hover/hover-echo", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../interaction/point-hover/hover-echo")
    >();
  return {
    ...original,
    useOwnedHoverEchoPublisher: () => mocks.publisher,
  };
});

beforeEach(() => {
  mocks.dwell = null;
  mocks.owned.clear();
  mocks.publisher.publish.mockReset();
  mocks.publisher.publish.mockImplementation((key, hover) => {
    mocks.owned.set(key, hover);
  });
  mocks.publisher.retract.mockReset();
  mocks.publisher.retract.mockImplementation((key) => {
    const hover = mocks.owned.get(key);
    if (!hover) return null;
    mocks.owned.delete(key);
    return { cleared: true, hover, key };
  });
  mocks.publisher.retire.mockReset();
  mocks.publisher.retire.mockImplementation((predicate) => {
    const retired = [];
    for (const [key, hover] of mocks.owned) {
      if (!predicate(key, hover)) continue;
      mocks.owned.delete(key);
      retired.push({ cleared: true, hover, key });
    }
    return retired;
  });
  mocks.publisher.disownAll.mockReset();
});

afterEach(() => cleanup());

describe("ImageProjectionOverlay", () => {
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
      expect(mocks.publisher.publish).toHaveBeenCalledWith("image-projection", {
        color: [1, 0, 0],
        contentTimeNs: 42n,
        fields: {},
        frameId: "lidar",
        kind: "point",
        pointIndex: 0,
        position: [1, 2, 3],
        source: {
          cameraFrameId: "camera",
          imageContentTimeNs: 21n,
          imageStream: "/camera/image",
          kind: "image-projection",
        },
        sourceLabel: "lidar/top",
        sourceName: "/lidar/top/points",
        stream: "41",
      }),
    );
    const tooltip = screen.getByTestId("episode-3d-hover-tooltip");
    expect(tooltip.textContent).toContain("lidar/top");
    expect(tooltip.textContent).toContain("/lidar/top/points");
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
    expect(mocks.publisher.publish).not.toHaveBeenCalled();
  });

  it("clears the published interaction when its point frame changes", async () => {
    const layer = projectionLayer();
    const picker = pickerHandle(
      Promise.resolve({
        layerIndex: 0,
        resourceKey: gpuPointCloudProjectionResourceKey(
          "recording",
          layer.stream,
          layer.contentTimeNs,
        ),
        sampleIndex: 0,
        sourceIndex: 0,
      }),
    );
    const rendered = renderOverlay(layer, picker);
    mockOverlayBounds(rendered.container);

    act(() => mocks.dwell?.onDwell(210, 170));
    await waitFor(() => expect(mocks.publisher.publish).toHaveBeenCalledOnce());
    expect(mocks.owned.has("image-projection")).toBe(true);

    rendered.rerender(projectionOverlay(projectionLayer(43n), picker));

    await waitFor(() =>
      expect(mocks.owned.has("image-projection")).toBe(false),
    );
    expect(picker.invalidate).toHaveBeenCalled();
    expect(screen.queryByTestId("episode-3d-hover-tooltip")).toBeNull();
  });
});

function renderOverlay(
  layer: ImageProjectionLayer,
  picker: GpuPointCloudProjectionPickerHandle,
) {
  return render(projectionOverlay(layer, picker));
}

function projectionOverlay(
  layer: ImageProjectionLayer,
  picker: GpuPointCloudProjectionPickerHandle,
) {
  return (
    <div>
      <ImageProjectionOverlay
        cameraFrameId="camera"
        cameraModel={cameraModel()}
        fit="contain"
        imageHeight={300}
        imageContentTimeNs={21n}
        imageStream="/camera/image"
        imageWidth={400}
        layers={[layer]}
        pickerRef={{ current: picker }}
        pointSize={2}
        sourceKey="recording"
      />
    </div>
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

function projectionLayer(contentTimeNs = 42n): ImageProjectionLayer {
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
    contentTimeNs,
    frame,
    payload,
    rotation: { w: 1, x: 0, y: 0, z: 0 },
    sourceLabel: "lidar/top",
    sourceName: "/lidar/top/points",
    stream: "41",
    translation: { x: 0, y: 0, z: 0 },
  };
}

function cameraModel(): CameraModel {
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
