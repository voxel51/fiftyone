import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensurePuckImages,
  hexColorWithAlpha,
  puckImageId,
  PUCK_VARIANT,
  voxel51PrimaryColor,
} from "./puck";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mcap map puck", () => {
  it("produces stable per-variant, per-color sprite ids", () => {
    expect(puckImageId(PUCK_VARIANT.NAV, "#fa5300")).toBe(
      "episode-puck-nav-#fa5300",
    );
    expect(puckImageId(PUCK_VARIANT.DOT, "#3b82f6")).toBe(
      "episode-puck-dot-#3b82f6",
    );
  });

  it("skips registration for ids the map already has", () => {
    const added: string[] = [];
    ensurePuckImages(
      {
        addImage: (id) => {
          added.push(id);
        },
        hasImage: () => true,
      },
      ["#fa5300", "#3b82f6"],
    );
    expect(added).toEqual([]);
  });

  it("degrades to a no-op without throwing when 2D canvas is unavailable", () => {
    mockCanvasContext(null);
    const added: string[] = [];
    ensurePuckImages(
      {
        addImage: (id) => {
          added.push(id);
        },
        hasImage: () => false,
      },
      ["#fa5300", "#fa5300"],
    );
    expect(added).toEqual([]);
  });

  it("registers each variant once for duplicate track colors", () => {
    mockCanvasContext(fakeCanvasContext());
    const added: string[] = [];

    ensurePuckImages(
      {
        addImage: (id) => {
          added.push(id);
        },
        hasImage: () => false,
      },
      ["#fa5300", "#fa5300"],
    );

    expect(added).toEqual([
      puckImageId(PUCK_VARIANT.DOT, "#fa5300"),
      puckImageId(PUCK_VARIANT.NAV, "#fa5300"),
    ]);
  });

  it("falls back to brand orange when the theme variable is absent", () => {
    expect(voxel51PrimaryColor()).toBe("#fa5300");
  });

  it("applies alpha to hex colors and passes through unparseable ones", () => {
    expect(hexColorWithAlpha("#fa5300", 0)).toBe("rgba(250, 83, 0, 0)");
    expect(hexColorWithAlpha("hsl(20, 100%, 49%)", 0.5)).toBe(
      "hsl(20, 100%, 49%)",
    );
  });
});

function mockCanvasContext(context: CanvasRenderingContext2D | null) {
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
    if (tagName === "canvas") {
      return {
        getContext: () => context,
        height: 0,
        width: 0,
      } as unknown as HTMLCanvasElement;
    }
    return createElement(tagName, options);
  });
}

function fakeCanvasContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    ellipse: vi.fn(),
    fill: vi.fn(),
    getImageData: vi.fn(
      () =>
        ({
          data: new Uint8ClampedArray(),
          height: 1,
          width: 1,
        }) as ImageData,
    ),
    lineJoin: "round",
    lineWidth: 0,
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
