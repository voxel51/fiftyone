import { BufferGeometry, Float32BufferAttribute } from "three";
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
      intensity: new Float32Array([0.1, 0.2, 0.3]),
      confidence: new Float32Array([0.9, 0.8, 0.7]),
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
      label: new Float32Array([1, 2, 3, 4, 5]),
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    const labelAttr = geometry.getAttribute("label") as Float32BufferAttribute;
    expect(labelAttr).toBeInstanceOf(Float32BufferAttribute);
    expect(labelAttr.itemSize).toBe(1);
    expect(Array.from(labelAttr.array)).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles different integer sizes correctly", () => {
    mockHeader.fields = ["a", "b", "c"];
    mockHeader.type = ["I", "I", "I"];
    mockHeader.size = [1, 2, 4];

    const position: number[] = [];
    const attributes = {
      a: new Float32Array([127, -128]),
      b: new Float32Array([32767, -32768]),
      c: new Float32Array([2147483647, -2147483648]),
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(geometry.getAttribute("a")).toBeInstanceOf(Float32BufferAttribute);
    expect(geometry.getAttribute("b")).toBeInstanceOf(Float32BufferAttribute);
    expect(geometry.getAttribute("c")).toBeInstanceOf(Float32BufferAttribute);
  });

  it("handles unsigned integer types correctly", () => {
    mockHeader.fields = ["a", "b", "c"];
    mockHeader.type = ["U", "U", "U"];
    mockHeader.size = [1, 2, 4];

    const position: number[] = [];
    const attributes = {
      a: new Float32Array([0, 255]),
      b: new Float32Array([0, 65535]),
      c: new Float32Array([0, 4294967295]),
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(geometry.getAttribute("a")).toBeInstanceOf(Float32BufferAttribute);
    expect(geometry.getAttribute("b")).toBeInstanceOf(Float32BufferAttribute);
    expect(geometry.getAttribute("c")).toBeInstanceOf(Float32BufferAttribute);
  });

  it("handles rgb attributes specially", () => {
    mockHeader.fields = ["rgb"];
    mockHeader.type = ["F"];
    mockHeader.size = [4];

    const position: number[] = [];
    const attributes = {
      rgb: new Float32Array([1, 0, 0, 0, 1, 0]),
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    const rgbAttr = geometry.getAttribute("rgb") as Float32BufferAttribute;
    expect(rgbAttr).toBeInstanceOf(Float32BufferAttribute);
    expect(rgbAttr.itemSize).toBe(3);
  });

  it("handles normal attributes specially", () => {
    mockHeader.fields = ["normal", "normal_x"];
    mockHeader.type = ["F", "F"];
    mockHeader.size = [4, 4];

    const position: number[] = [];
    const attributes = {
      normal: new Float32Array([0, 1, 0, 1, 0, 0]),
      normal_x: new Float32Array([1, 0, 0, 0, 0, 1]),
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
      unknown_field: new Float32Array([1, 2, 3]),
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Field "unknown_field" not found in header fields'
    );
    expect(geometry.getAttribute("unknown_field")).toBeUndefined();

    consoleSpy.mockRestore();
  });

  it("handles unknown field types by defaulting to Float32", () => {
    mockHeader.fields = ["unknown"];
    mockHeader.type = ["X" as any];
    mockHeader.size = [4];

    const position: number[] = [];
    const attributes = {
      unknown: new Float32Array([1, 2, 3]),
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    expect(geometry.getAttribute("unknown")).toBeInstanceOf(
      Float32BufferAttribute
    );
  });

  it("skips empty attribute arrays", () => {
    const position: number[] = [];
    const attributes = {
      intensity: new Float32Array([1, 2, 3]),
      empty_field: new Float32Array([]),
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
      int8_field: new Float32Array([100, -50, 127]),
      int16_field: new Float32Array([1000, -500, 32767]),
      uint8_field: new Float32Array([255, 128, 0]),
    };

    const geometry = createBufferGeometry(mockHeader, position, attributes);

    const int8Attr = geometry.getAttribute(
      "int8_field"
    ) as Float32BufferAttribute;
    expect(int8Attr.array).toBeInstanceOf(Float32Array);
    expect(Array.from(int8Attr.array)).toEqual([100, -50, 127]);

    const int16Attr = geometry.getAttribute(
      "int16_field"
    ) as Float32BufferAttribute;
    expect(int16Attr.array).toBeInstanceOf(Float32Array);
    expect(Array.from(int16Attr.array)).toEqual([1000, -500, 32767]);

    const uint8Attr = geometry.getAttribute(
      "uint8_field"
    ) as Float32BufferAttribute;
    expect(uint8Attr.array).toBeInstanceOf(Float32Array);
    expect(Array.from(uint8Attr.array)).toEqual([255, 128, 0]);
  });
});
