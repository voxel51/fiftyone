import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GpuImageAnnotationPickerHandle } from "../../../visualization/media-2d/GpuImageAnnotationPicker";
import type { PreparedImageAnnotations } from "../../../visualization/media-2d/gpu-image-annotation-preparation";
import ImageAnnotationOverlay from "./ImageAnnotationOverlay";

afterEach(() => {
  vi.useRealTimers();
});

describe("ImageAnnotationOverlay", () => {
  it("dwells through GPU picking and shows text only in the tooltip", async () => {
    vi.useFakeTimers();
    const picker = pickerHandle({ primitiveIndex: 0 });
    const { container } = renderOverlay(picker);
    const surface = container.firstElementChild as HTMLElement;
    setBounds(
      surface.querySelector(
        "[data-episode-image-annotation-overlay]",
      ) as HTMLElement,
    );

    surface.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        buttons: 0,
        clientX: 110,
        clientY: 70,
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });

    expect(picker.pick).toHaveBeenCalledWith({
      radiusPx: 6,
      targetU: 100,
      targetV: 50,
    });
    const tooltip = screen.getByTestId("episode-image-annotation-tooltip");
    expect(tooltip.textContent).toContain("car");
    expect(tooltip.textContent).toContain("Stream3D detections");
    expect(tooltip.textContent).not.toContain("21");
    expect(container.querySelector("svg")).toBeNull();
    expect(
      container.querySelectorAll("circle, line, polygon, polyline"),
    ).toHaveLength(0);
  });

  it("resolves click selection through the same integer picker", async () => {
    const picker = pickerHandle({ primitiveIndex: 0 });
    const onSelectPrimitive = vi.fn();
    const { container } = renderOverlay(picker, onSelectPrimitive);
    const surface = container.firstElementChild as HTMLElement;
    setBounds(
      surface.querySelector(
        "[data-episode-image-annotation-overlay]",
      ) as HTMLElement,
    );

    fireEvent.click(surface, {
      clientX: 60,
      clientY: 45,
      shiftKey: true,
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSelectPrimitive).toHaveBeenCalledWith(0, true);
  });

  it("does not select at the end of a pan gesture", async () => {
    const picker = pickerHandle({ primitiveIndex: 0 });
    const onSelectPrimitive = vi.fn();
    const { container } = renderOverlay(picker, onSelectPrimitive);
    const surface = container.firstElementChild as HTMLElement;
    setBounds(
      surface.querySelector(
        "[data-episode-image-annotation-overlay]",
      ) as HTMLElement,
    );

    surface.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 60,
        clientY: 45,
      }),
    );
    surface.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        clientX: 80,
        clientY: 65,
      }),
    );
    fireEvent.click(surface, { clientX: 80, clientY: 65 });
    await act(async () => {
      await Promise.resolve();
    });

    expect(picker.pick).not.toHaveBeenCalled();
    expect(onSelectPrimitive).not.toHaveBeenCalled();
  });
});

function renderOverlay(
  picker: GpuImageAnnotationPickerHandle,
  onSelectPrimitive = vi.fn(),
) {
  const pickerRef = { current: picker };
  return render(
    <div>
      <ImageAnnotationOverlay
        fit="contain"
        imageHeight={100}
        imageWidth={200}
        onHoverPrimitive={vi.fn()}
        onSelectPrimitive={onSelectPrimitive}
        pickerRef={pickerRef}
        prepared={prepared()}
        sourceLabelsById={new Map([["21", "3D detections"]])}
      />
    </div>,
  );
}

function pickerHandle(
  result: Awaited<ReturnType<GpuImageAnnotationPickerHandle["pick"]>>,
): GpuImageAnnotationPickerHandle {
  const pick = vi.fn<GpuImageAnnotationPickerHandle["pick"]>();
  pick.mockResolvedValue(result);
  return {
    invalidate: vi.fn<GpuImageAnnotationPickerHandle["invalidate"]>(),
    pick,
  };
}

function prepared(): PreparedImageAnnotations {
  return {
    metadata: [
      {
        color: "#ee0000",
        key: "p-0",
        label: "car",
        primitive: {
          kind: "points",
          value: {
            fillColor: null,
            outlineColor: null,
            outlineColors: [],
            points: [[100, 50]],
            thickness: 2,
            type: "points",
          },
        },
        primitiveIndex: 0,
        stream: "21",
      },
    ],
    picks: {
      a: new Float32Array([100, 50]),
      b: new Float32Array([100, 50]),
      c: new Float32Array([100, 50]),
      count: 1,
      kinds: new Float32Array([0]),
      orders: new Float32Array([0]),
      primitiveIndices: new Uint32Array([0]),
      radii: new Float32Array([2]),
    },
    pointOffsets: new Uint32Array([0, 1]),
    points: {
      centers: new Float32Array([100, 50]),
      colors: new Float32Array([1, 0, 0]),
      count: 1,
      diameters: new Float32Array([4]),
      kinds: new Float32Array([0]),
      primitiveIndices: new Uint32Array([0]),
      thicknesses: new Float32Array([2]),
    },
    segmentOffsets: new Uint32Array([0, 0]),
    segments: {
      colors: new Float32Array(),
      count: 0,
      ends: new Float32Array(),
      primitiveIndices: new Uint32Array(),
      starts: new Float32Array(),
      thicknesses: new Float32Array(),
    },
  };
}

function setBounds(element: HTMLElement): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 120,
      height: 100,
      left: 10,
      right: 210,
      top: 20,
      width: 200,
      x: 10,
      y: 20,
    }),
  });
}
