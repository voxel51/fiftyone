import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VISUALIZATION_KIND } from "../visualization-registry";
import type { ImageAnnotationsVisualization, RgbaColor } from "../../decoders";
import { ImageAnnotationsOverlay } from "./ImageAnnotationsOverlay";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// ResizeObserver mock — fires immediately with the given container size so
// the SVG is rendered synchronously in tests.
// ---------------------------------------------------------------------------

const CONTAINER_W = 400;
const CONTAINER_H = 300;

beforeEach(() => {
  global.ResizeObserver = class MockResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      this.cb(
        [
          {
            contentRect: { width: CONTAINER_W, height: CONTAINER_H },
            target: el,
          } as ResizeObserverEntry,
        ],
        this
      );
    }
    disconnect() {}
    unobserve() {}
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RED: RgbaColor = [1, 0, 0, 1];
const GREEN: RgbaColor = [0, 1, 0, 0.5];
const WHITE: RgbaColor = [1, 1, 1, 1];
const BLACK: RgbaColor = [0, 0, 0, 1];

function emptySet(): ImageAnnotationsVisualization {
  return { kind: VISUALIZATION_KIND.IMAGE_ANNOTATIONS, circles: [], points: [], texts: [] };
}

function render200x100(annotations: ImageAnnotationsVisualization[]) {
  // 200×100 image → aspect ratio 2 → letterboxed into 400×300 container
  // constrainByWidth = true (imageIsWider)
  // rectWidth = 400, rectHeight = 400/2 = 200, x = 0, y = 50
  return render(
    <ImageAnnotationsOverlay
      annotations={annotations}
      imageWidth={200}
      imageHeight={100}
      fit="contain"
    />
  );
}

// ---------------------------------------------------------------------------
// No-render guards
// ---------------------------------------------------------------------------

describe("ImageAnnotationsOverlay", () => {
  it("renders only an aria-hidden container when annotations array is empty", () => {
    const { container } = render200x100([]);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[aria-hidden]")).toBeTruthy();
  });

  it("renders only an aria-hidden container when imageWidth is 0", () => {
    const { container } = render(
      <ImageAnnotationsOverlay
        annotations={[{ ...emptySet(), circles: [{ position: [0, 0], diameter: 10, thickness: 1, outlineColor: RED, fillColor: null }] }]}
        imageWidth={0}
        imageHeight={100}
        fit="contain"
      />
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders only an aria-hidden container when imageHeight is 0", () => {
    const { container } = render(
      <ImageAnnotationsOverlay
        annotations={[{ ...emptySet(), circles: [{ position: [0, 0], diameter: 10, thickness: 1, outlineColor: RED, fillColor: null }] }]}
        imageWidth={200}
        imageHeight={0}
        fit="contain"
      />
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Layout — displayRect / letterbox
  // -------------------------------------------------------------------------

  it("positions the SVG with letterbox offsets for a wide image in contain mode", () => {
    // 200×100 in 400×300: constrained by width → rect 400×200, y-offset 50
    const { container } = render200x100([{
      ...emptySet(),
      circles: [{ position: [100, 50], diameter: 20, thickness: 1, outlineColor: RED, fillColor: null }],
    }]);

    const svg = container.querySelector("svg")!;
    expect(svg.style.left).toBe("0px");
    expect(svg.style.top).toBe("50px");
    expect(svg.style.width).toBe("400px");
    expect(svg.style.height).toBe("200px");
  });

  it("positions the SVG with pillarbox offsets for a tall image in contain mode", () => {
    // 100×200 image (aspect 0.5) in 400×300 container
    // imageIsWider = false → constrainByWidth = false → constrained by height
    // rectHeight = 300, rectWidth = 300 * 0.5 = 150, x = (400-150)/2 = 125
    const { container } = render(
      <ImageAnnotationsOverlay
        annotations={[{
          ...emptySet(),
          circles: [{ position: [0, 0], diameter: 10, thickness: 1, outlineColor: RED, fillColor: null }],
        }]}
        imageWidth={100}
        imageHeight={200}
        fit="contain"
      />
    );

    const svg = container.querySelector("svg")!;
    expect(svg.style.left).toBe("125px");
    expect(svg.style.top).toBe("0px");
    expect(svg.style.width).toBe("150px");
    expect(svg.style.height).toBe("300px");
  });

  it("sets the SVG viewBox to match the image's natural pixel dimensions", () => {
    const { container } = render200x100([{
      ...emptySet(),
      circles: [{ position: [0, 0], diameter: 10, thickness: 1, outlineColor: RED, fillColor: null }],
    }]);

    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 200 100"
    );
  });

  // -------------------------------------------------------------------------
  // Circles
  // -------------------------------------------------------------------------

  it("renders a circle with cx, cy, radius, stroke, fill, and non-scaling stroke", () => {
    const { container } = render200x100([{
      ...emptySet(),
      circles: [{ position: [60, 40], diameter: 30, thickness: 3, outlineColor: RED, fillColor: GREEN }],
    }]);

    const circle = container.querySelector("circle")!;
    expect(circle.getAttribute("cx")).toBe("60");
    expect(circle.getAttribute("cy")).toBe("40");
    expect(circle.getAttribute("r")).toBe("15");
    expect(circle.getAttribute("stroke-width")).toBe("3");
    expect(circle.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    expect(circle.getAttribute("fill")).toMatch(/rgba\(0,\s*255,\s*0/);
    expect(circle.getAttribute("stroke")).toMatch(/rgba\(255,\s*0,\s*0/);
  });

  it("renders a circle with fill=none when fillColor is null", () => {
    const { container } = render200x100([{
      ...emptySet(),
      circles: [{ position: [0, 0], diameter: 10, thickness: 1, outlineColor: RED, fillColor: null }],
    }]);

    expect(container.querySelector("circle")?.getAttribute("fill")).toBe("none");
  });

  // -------------------------------------------------------------------------
  // Points — line-loop (CodeRabbit fix: first point appended to close loop)
  // -------------------------------------------------------------------------

  it("closes a line-loop by appending the first point at the end of the polyline", () => {
    const { container } = render200x100([{
      ...emptySet(),
      points: [{
        type: "line-loop",
        points: [[0, 0], [10, 0], [10, 10]],
        thickness: 1,
        outlineColor: RED,
        outlineColors: [],
        fillColor: null,
      }],
    }]);

    const polyline = container.querySelector("polyline")!;
    const pts = polyline.getAttribute("points")!;
    const pairs = pts.trim().split(/\s+/);
    // 3 original + 1 closing = 4 pairs
    expect(pairs).toHaveLength(4);
    expect(pairs[0]).toBe(pairs[3]);
  });

  it("does not add a closing point to a line-strip", () => {
    const { container } = render200x100([{
      ...emptySet(),
      points: [{
        type: "line-strip",
        points: [[0, 0], [10, 0], [10, 10]],
        thickness: 1,
        outlineColor: RED,
        outlineColors: [],
        fillColor: null,
      }],
    }]);

    const polyline = container.querySelector("polyline")!;
    const pairs = polyline.getAttribute("points")!.trim().split(/\s+/);
    expect(pairs).toHaveLength(3);
  });

  it("renders a line-list as individual <line> elements for each segment pair", () => {
    const { container } = render200x100([{
      ...emptySet(),
      points: [{
        type: "line-list",
        points: [[0, 0], [10, 10], [20, 0], [30, 10]],
        thickness: 2,
        outlineColor: RED,
        outlineColors: [],
        fillColor: null,
      }],
    }]);

    const lines = container.querySelectorAll("line");
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute("x1")).toBe("0");
    expect(lines[0].getAttribute("y1")).toBe("0");
    expect(lines[0].getAttribute("x2")).toBe("10");
    expect(lines[0].getAttribute("y2")).toBe("10");
  });

  it("renders individual points as circles with per-point colors", () => {
    const { container } = render200x100([{
      ...emptySet(),
      points: [{
        type: "points",
        points: [[5, 5], [15, 15]],
        thickness: 4,
        outlineColor: RED,
        outlineColors: [WHITE, BLACK],
        fillColor: null,
      }],
    }]);

    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    // Per-point colors take precedence
    expect(circles[0].getAttribute("fill")).toMatch(/rgba\(255,\s*255,\s*255/);
    expect(circles[1].getAttribute("fill")).toMatch(/rgba\(0,\s*0,\s*0/);
  });

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  it("renders a text element at the annotation position", () => {
    const { container } = render200x100([{
      ...emptySet(),
      texts: [{ position: [50, 30], text: "hello", fontSize: 12, textColor: WHITE, backgroundColor: null }],
    }]);

    const text = container.querySelector("text")!;
    expect(text.getAttribute("x")).toBe("50");
    expect(text.getAttribute("y")).toBe("30");
    expect(text.textContent).toBe("hello");
  });

  it("renders a background rect when backgroundColor is set", () => {
    const { container } = render200x100([{
      ...emptySet(),
      texts: [{ position: [10, 20], text: "tag", fontSize: 10, textColor: WHITE, backgroundColor: BLACK }],
    }]);

    const rect = container.querySelector("rect");
    expect(rect).toBeTruthy();
    expect(rect?.getAttribute("fill")).toMatch(/rgba\(0,\s*0,\s*0/);
  });

  it("omits the background rect when backgroundColor is null", () => {
    const { container } = render200x100([{
      ...emptySet(),
      texts: [{ position: [0, 0], text: "no-bg", fontSize: 10, textColor: WHITE, backgroundColor: null }],
    }]);

    expect(container.querySelector("rect")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Multiple annotation sets
  // -------------------------------------------------------------------------

  it("renders primitives from multiple annotation sets in a single SVG", () => {
    const { container } = render200x100([
      {
        ...emptySet(),
        circles: [{ position: [0, 0], diameter: 10, thickness: 1, outlineColor: RED, fillColor: null }],
      },
      {
        ...emptySet(),
        circles: [{ position: [50, 50], diameter: 20, thickness: 1, outlineColor: GREEN, fillColor: null }],
      },
    ]);

    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });
});
