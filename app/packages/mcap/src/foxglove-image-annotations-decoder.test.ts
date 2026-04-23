import { afterEach, describe, expect, it, vi } from "vitest";

const { decodeFoxgloveImageAnnotationsMessageMock } = vi.hoisted(() => ({
  decodeFoxgloveImageAnnotationsMessageMock: vi.fn(),
}));

vi.mock("./foxglove-protobuf", async () => {
  const actual = await vi.importActual<typeof import("./foxglove-protobuf")>(
    "./foxglove-protobuf"
  );

  return {
    ...actual,
    decodeFoxgloveImageAnnotationsMessage:
      decodeFoxgloveImageAnnotationsMessageMock,
  };
});

const { decodeFoxgloveImageAnnotationsPayload } = await import(
  "./foxglove-image-annotations-decoder"
);

describe("decodeFoxgloveImageAnnotationsPayload", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prefers .label, falls back to .category, and reuses colors across overlay types", () => {
    decodeFoxgloveImageAnnotationsMessageMock.mockReturnValue({
      timestamp: { seconds: 1, nanos: 0 },
      metadata: [{ key: ".category", value: "vehicle" }],
      circles: [
        {
          position: { x: 5, y: 5 },
          diameter: 10,
        },
      ],
      points: [
        {
          type: 2,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ],
          metadata: [
            { key: ".label", value: "car" },
            { key: ".category", value: "vehicle" },
          ],
        },
        {
          type: 1,
          points: [{ x: 20, y: 20 }],
          metadata: [
            { key: ".label", value: "car" },
            { key: ".category", value: "person" },
          ],
        },
      ],
      texts: [
        {
          position: { x: 30, y: 30 },
          text: "pedestrian",
          metadata: [{ key: ".category", value: "pedestrian" }],
        },
      ],
    });

    const decoded = decodeFoxgloveImageAnnotationsPayload(new Uint8Array([1]));
    const [vehicleCircle, carPolyline, carPoint, pedestrianText] =
      decoded.overlays;

    expect(carPolyline?.kind).toBe("polyline");
    expect(carPoint?.kind).toBe("points");
    expect(vehicleCircle?.kind).toBe("circle");
    expect(pedestrianText?.kind).toBe("text");

    expect(carPolyline?.strokeColor).toBe(carPoint?.strokeColor);
    expect(carPolyline?.strokeColor).toMatch(/^#/);
    expect(carPolyline?.fillColor).toMatch(/^rgba\(/);
    expect(vehicleCircle?.strokeColor).toMatch(/^#/);
    expect(vehicleCircle?.strokeColor).not.toBe(carPolyline?.strokeColor);
    expect(pedestrianText?.backgroundColor).toMatch(/^rgba\(/);
    expect(pedestrianText?.backgroundColor).not.toBe("rgba(11, 18, 29, 0.82)");
    expect(pedestrianText?.textColor).toBe("rgba(255,255,255,1)");
  });

  it("uses explicit outlineColors for polyline segment strokes", () => {
    decodeFoxgloveImageAnnotationsMessageMock.mockReturnValue({
      timestamp: { seconds: 1, nanos: 0 },
      metadata: [{ key: ".category", value: "vehicle" }],
      circles: [],
      points: [
        {
          type: 2,
          points: [
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 30, y: 30 },
            { x: 10, y: 30 },
          ],
          outlineColor: { r: 0, g: 0, b: 1, a: 1 },
          outlineColors: [
            { r: 1, g: 0, b: 0, a: 1 },
            { r: 0, g: 1, b: 0, a: 1 },
            { r: 1, g: 1, b: 0, a: 1 },
            { r: 1, g: 0, b: 1, a: 1 },
          ],
          fillColor: { r: 0.2, g: 0.2, b: 0.2, a: 0.2 },
          metadata: [{ key: ".category", value: "vehicle" }],
        },
      ],
      texts: [],
    });

    const decoded = decodeFoxgloveImageAnnotationsPayload(new Uint8Array([1]));
    const [polyline] = decoded.overlays;

    expect(polyline).toMatchObject({
      kind: "polyline",
      fillColor: "rgba(51, 51, 51, 0.2)",
      strokeColor: "rgba(0, 0, 255, 1)",
      segmentColors: [
        "rgba(255, 0, 0, 1)",
        "rgba(0, 255, 0, 1)",
        "rgba(255, 255, 0, 1)",
        "rgba(255, 0, 255, 1)",
      ],
    });
  });

  it("preserves explicit foxglove colors when semantic metadata is absent", () => {
    decodeFoxgloveImageAnnotationsMessageMock.mockReturnValue({
      timestamp: { seconds: 1, nanos: 0 },
      circles: [
        {
          position: { x: 5, y: 5 },
          diameter: 10,
          fillColor: { r: 1, g: 0, b: 0, a: 0.5 },
          outlineColor: { r: 0, g: 1, b: 0, a: 1 },
        },
      ],
      points: [],
      texts: [],
    });

    const decoded = decodeFoxgloveImageAnnotationsPayload(new Uint8Array([1]));

    expect(decoded.overlays).toHaveLength(1);
    expect(decoded.overlays[0]).toMatchObject({
      fillColor: "rgba(255, 0, 0, 0.5)",
      strokeColor: "rgba(0, 255, 0, 1)",
    });
  });
});
