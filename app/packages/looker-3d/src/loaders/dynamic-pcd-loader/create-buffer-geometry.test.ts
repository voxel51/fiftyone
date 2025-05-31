import {
  BufferGeometry,
  Float32BufferAttribute,
  Int16BufferAttribute,
  Int32BufferAttribute,
  Int8BufferAttribute,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Uint8BufferAttribute,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBufferGeometry } from "./create-buffer-geometry";
import { PCDHeader } from "./types";

describe("createBufferGeometry", () => {
  let mockHeader: PCDHeader;

  beforeEach(() => {
    mockHeader = {
      data: "binary",
      headerLen: 100,
      fields: ["x", "y", "z", "intensity", "label", "confidence"],
      size: [4, 4, 4, 4, 4, 4],
      type: ["F", "F", "F", "F", "I", "F"],
      count: [1, 1, 1, 1, 1, 1],
      width: 100,
      height: 1,
      points: 100,
      offset: { x: 0, y: 4, z: 8, intensity: 12, label: 16, confidence: 20 },
      rowSize: 24,
      str: "",
    };
  });

  it("creates geometry with position attribute", () => {
    const position = [1, 2, 3, 4, 5, 6];
    const attributes = {};

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(geometry).toBeInstanceOf(BufferGeometry);
    expect(geometry.getAttribute("position")).toBeDefined();

    const posAttribute = geometry.getAttribute(
      "position"
    ) as Float32BufferAttribute;
    expect(posAttribute).toBeInstanceOf(Float32BufferAttribute);
    expect(Array.from(posAttribute.array)).toEqual(position);
    expect(posAttribute.itemSize).toBe(3);
  });

  it("handles empty position array", () => {
    const position: number[] = [];
    const attributes = {};

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(geometry).toBeInstanceOf(BufferGeometry);
    expect(geometry.getAttribute("position")).toBeUndefined();
  });

  it("creates Float32 attributes for type 'F' with size 4", () => {
    const position: number[] = [];
    const attributes = {
      intensity: [0.1, 0.2, 0.3],
      confidence: [0.9, 0.8, 0.7],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    const intensityAttr = geometry.getAttribute(
      "intensity"
    ) as Float32BufferAttribute;
    expect(intensityAttr).toBeInstanceOf(Float32BufferAttribute);
    expect(intensityAttr.itemSize).toBe(1);

    // Use toBeCloseTo for floating point comparisons
    expect(intensityAttr.array[0]).toBeCloseTo(0.1, 5);
    expect(intensityAttr.array[1]).toBeCloseTo(0.2, 5);
    expect(intensityAttr.array[2]).toBeCloseTo(0.3, 5);

    const confidenceAttr = geometry.getAttribute(
      "confidence"
    ) as Float32BufferAttribute;
    expect(confidenceAttr).toBeInstanceOf(Float32BufferAttribute);
  });

  it("creates Int32 attributes for type 'I' with size 4", () => {
    const position: number[] = [];
    const attributes = {
      label: [1, 2, 3, 4, 5],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    const labelAttr = geometry.getAttribute("label") as Int32BufferAttribute;
    expect(labelAttr).toBeInstanceOf(Int32BufferAttribute);
    expect(labelAttr.itemSize).toBe(1);
    expect(Array.from(labelAttr.array)).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles different integer sizes correctly", () => {
    mockHeader.fields = ["a", "b", "c"];
    mockHeader.type = ["I", "I", "I"];
    mockHeader.size = [1, 2, 4];

    const position: number[] = [];
    const attributes = {
      a: [127, -128],
      b: [32767, -32768],
      c: [2147483647, -2147483648],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(geometry.getAttribute("a")).toBeInstanceOf(Int8BufferAttribute);
    expect(geometry.getAttribute("b")).toBeInstanceOf(Int16BufferAttribute);
    expect(geometry.getAttribute("c")).toBeInstanceOf(Int32BufferAttribute);
  });

  it("handles unsigned integer types correctly", () => {
    mockHeader.fields = ["a", "b", "c"];
    mockHeader.type = ["U", "U", "U"];
    mockHeader.size = [1, 2, 4];

    const position: number[] = [];
    const attributes = {
      a: [0, 255],
      b: [0, 65535],
      c: [0, 4294967295],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(geometry.getAttribute("a")).toBeInstanceOf(Uint8BufferAttribute);
    expect(geometry.getAttribute("b")).toBeInstanceOf(Uint16BufferAttribute);
    expect(geometry.getAttribute("c")).toBeInstanceOf(Uint32BufferAttribute);
  });

  it("handles rgb/color attributes specially", () => {
    mockHeader.fields = ["rgb", "color"];
    mockHeader.type = ["F", "F"];
    mockHeader.size = [4, 4];

    const position: number[] = [];
    const attributes = {
      rgb: [1, 0, 0, 0, 1, 0], // Two RGB values
      color: [0, 0, 1, 1, 1, 0], // Two RGB values
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    // rgb should be stored as "color" attribute
    const colorAttr = geometry.getAttribute("color") as Float32BufferAttribute;
    expect(colorAttr).toBeInstanceOf(Float32BufferAttribute);
    expect(colorAttr.itemSize).toBe(3);
    expect(geometry.getAttribute("rgb")).toBeUndefined();
  });

  it("handles normal attributes specially", () => {
    mockHeader.fields = ["normal", "normal_x"];
    mockHeader.type = ["F", "F"];
    mockHeader.size = [4, 4];

    const position: number[] = [];
    const attributes = {
      normal: [0, 1, 0, 1, 0, 0],
      normal_x: [1, 0, 0, 0, 0, 1],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    const normalAttr = geometry.getAttribute(
      "normal"
    ) as Float32BufferAttribute;
    expect(normalAttr).toBeInstanceOf(Float32BufferAttribute);
    expect(normalAttr.itemSize).toBe(3);
  });

  it("warns and skips fields not found in header", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const position: number[] = [];
    const attributes = {
      unknown_field: [1, 2, 3],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Field "unknown_field" not found in header fields'
    );
    expect(geometry.getAttribute("unknown_field")).toBeUndefined();

    consoleSpy.mockRestore();
  });

  it("warns for unsupported sizes and uses defaults", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockHeader.fields = ["a", "b", "c"];
    mockHeader.type = ["F", "I", "U"];
    mockHeader.size = [8, 8, 8]; // Unsupported sizes

    const position: number[] = [];
    const attributes = {
      a: [1.1, 2.2],
      b: [100, 200],
      c: [300, 400],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Unsupported float size 8, defaulting to Float32"
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Unsupported signed integer size 8, defaulting to Int32"
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Unsupported unsigned integer size 8, defaulting to Uint32"
    );

    expect(geometry.getAttribute("a")).toBeInstanceOf(Float32BufferAttribute);
    expect(geometry.getAttribute("b")).toBeInstanceOf(Int32BufferAttribute);
    expect(geometry.getAttribute("c")).toBeInstanceOf(Uint32BufferAttribute);

    consoleSpy.mockRestore();
  });

  it("handles unknown field types by defaulting to Float32", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockHeader.fields = ["unknown"];
    mockHeader.type = ["X" as any];
    mockHeader.size = [4];

    const position: number[] = [];
    const attributes = {
      unknown: [1, 2, 3],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Unknown PCD field type "X", defaulting to Float32'
    );
    expect(geometry.getAttribute("unknown")).toBeInstanceOf(
      Float32BufferAttribute
    );

    consoleSpy.mockRestore();
  });

  it("skips empty attribute arrays", () => {
    const position: number[] = [];
    const attributes = {
      intensity: [1, 2, 3],
      empty_field: [],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(geometry.getAttribute("intensity")).toBeInstanceOf(
      Float32BufferAttribute
    );
    expect(geometry.getAttribute("empty_field")).toBeUndefined();
  });

  it("calls computeBoundingSphere and sets boundingSphere", () => {
    const position = [1, 2, 3, 4, 5, 6];
    const attributes = {};

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    // BufferGeometry.computeBoundingSphere() sets the boundingSphere property
    expect(geometry.boundingSphere).toBeDefined();
    expect(geometry.boundingSphere).not.toBeNull();
  });

  it("correctly converts typed arrays for integer attributes", () => {
    mockHeader.fields = ["int8_field", "int16_field", "uint8_field"];
    mockHeader.type = ["I", "I", "U"];
    mockHeader.size = [1, 2, 1];

    const position: number[] = [];
    const attributes = {
      int8_field: [100, -50, 127],
      int16_field: [1000, -500, 32767],
      uint8_field: [255, 128, 0],
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    const int8Attr = geometry.getAttribute("int8_field") as Int8BufferAttribute;
    expect(int8Attr.array).toBeInstanceOf(Int8Array);
    expect(Array.from(int8Attr.array)).toEqual([100, -50, 127]);

    const int16Attr = geometry.getAttribute(
      "int16_field"
    ) as Int16BufferAttribute;
    expect(int16Attr.array).toBeInstanceOf(Int16Array);
    expect(Array.from(int16Attr.array)).toEqual([1000, -500, 32767]);

    const uint8Attr = geometry.getAttribute(
      "uint8_field"
    ) as Uint8BufferAttribute;
    expect(uint8Attr.array).toBeInstanceOf(Uint8Array);
    expect(Array.from(uint8Attr.array)).toEqual([255, 128, 0]);
  });
});
