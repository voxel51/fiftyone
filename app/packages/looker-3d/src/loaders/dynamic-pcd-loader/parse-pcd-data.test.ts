import { describe, expect, it } from "vitest";
import { parsePCDData } from "./parse-pcd-data";

const createASCIIPCD = (fields: string[], data: number[][]): ArrayBuffer => {
  const fieldList = fields.join(" ");
  const sizes = fields.map(() => "4").join(" ");
  const types = fields.map((f) => (f === "label" ? "I" : "F")).join(" ");
  const counts = fields.map(() => "1").join(" ");

  const header = [
    "# .PCD v.7 - Point Cloud Data file format",
    "VERSION .7",
    `FIELDS ${fieldList}`,
    `SIZE ${sizes}`,
    `TYPE ${types}`,
    `COUNT ${counts}`,
    `WIDTH ${data.length}`,
    "HEIGHT 1",
    "VIEWPOINT 0 0 0 1 0 0 0",
    `POINTS ${data.length}`,
    "DATA ascii",
  ].join("\n");

  const dataLines = data.map((row) => row.join(" ")).join("\n");
  const fullText = header + "\n" + dataLines;

  const encoded = new TextEncoder().encode(fullText);
  const buffer = new ArrayBuffer(encoded.length);
  new Uint8Array(buffer).set(encoded);
  return buffer;
};

const createBinaryPCD = (
  fields: string[],
  data: number[][],
  overrideMap?: {
    types?: Record<string, string>;
    sizes?: Record<string, string>;
  }
): ArrayBuffer => {
  const sizesText = fields.map((f) => overrideMap?.sizes?.[f] ?? "4");
  const typesText = fields.map(
    (f) => overrideMap?.types?.[f] ?? (f === "label" ? "I" : "F")
  );
  const counts = fields.map(() => "1");

  const numericSizes = sizesText.map((s) => parseInt(s, 10));
  const rowSize = numericSizes.reduce((a, b) => a + b, 0);

  const header =
    [
      "# .PCD v.7 - Point Cloud Data file format",
      "VERSION .7",
      `FIELDS ${fields.join(" ")}`,
      `SIZE ${sizesText.join(" ")}`,
      `TYPE ${typesText.join(" ")}`,
      `COUNT ${counts.join(" ")}`,
      `WIDTH ${data.length}`,
      "HEIGHT 1",
      "VIEWPOINT 0 0 0 1 0 0 0",
      `POINTS ${data.length}`,
      "DATA binary",
    ].join("\n") + "\n";

  const headerBytes = new TextEncoder().encode(header);
  const buffer = new ArrayBuffer(headerBytes.length + data.length * rowSize);
  const dataView = new DataView(buffer);

  // copy header
  new Uint8Array(buffer).set(headerBytes, 0);

  // write rows with dynamic sizes
  let offset = headerBytes.length;
  for (const row of data) {
    for (let i = 0; i < fields.length; i++) {
      const type = typesText[i];
      const size = numericSizes[i];
      const val = row[i];

      if (type === "F") {
        if (size === 8) dataView.setFloat64(offset, val, true);
        else dataView.setFloat32(offset, val, true);
      } else if (type === "I") {
        if (size === 1) dataView.setInt8(offset, val);
        else if (size === 2) dataView.setInt16(offset, val, true);
        else dataView.setInt32(offset, val, true);
      } else if (type === "U") {
        if (size === 1) dataView.setUint8(offset, val);
        else if (size === 2) dataView.setUint16(offset, val, true);
        else dataView.setUint32(offset, val, true);
      } else if (fields[i] === "rgb") {
        const r = Math.floor(row[i] * 255);
        const g = Math.floor(row[i + 1] * 255);
        const b = Math.floor(row[i + 2] * 255);
        const packed = (r << 16) | (g << 8) | b;
        dataView.setUint32(offset, packed, true);
      } else {
        // fallback float32
        dataView.setFloat32(offset, val, true);
      }

      offset += size;
      // if rgb consumed 3 inputs, skip ahead
      if (fields[i] === "rgb") i += 2;
    }
  }

  return buffer;
};

describe("parsePCDData", () => {
  describe("Position only", () => {
    it("should parse ASCII PCD with position only", () => {
      const data = createASCIIPCD(
        ["x", "y", "z"],
        [
          [1.0, 2.0, 3.0],
          [4.0, 5.0, 6.0],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes).toEqual({});
    });

    it("should parse Binary PCD with position only", () => {
      const data = createBinaryPCD(
        ["x", "y", "z"],
        [
          [1.0, 2.0, 3.0],
          [4.0, 5.0, 6.0],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes).toEqual({});
    });
  });

  describe("Intensity attribute", () => {
    it("should parse ASCII PCD with intensity", () => {
      const data = createASCIIPCD(
        ["x", "y", "z", "intensity"],
        [
          [1.0, 2.0, 3.0, 0.5],
          [4.0, 5.0, 6.0, 0.8],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.intensity.length).toBe(2);
      expect(result.attributes.intensity[0]).toBeCloseTo(0.5, 6);
      expect(result.attributes.intensity[1]).toBeCloseTo(0.8, 6);
    });

    it("should parse Binary PCD with intensity", () => {
      const data = createBinaryPCD(
        ["x", "y", "z", "intensity"],
        [
          [1.0, 2.0, 3.0, 0.5],
          [4.0, 5.0, 6.0, 0.8],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.intensity.length).toBe(2);
      expect(result.attributes.intensity[0]).toBeCloseTo(0.5, 6);
      expect(result.attributes.intensity[1]).toBeCloseTo(0.8, 6);
    });
  });

  describe("RGB attribute", () => {
    it("should parse ASCII PCD with RGB", () => {
      // RGB in ASCII is packed as a single float value
      const r1 = 255,
        g1 = 0,
        b1 = 0;
      const r2 = 0,
        g2 = 255,
        b2 = 0;
      const packed1 = new Float32Array(
        new Uint32Array([(r1 << 16) | (g1 << 8) | b1]).buffer
      )[0];
      const packed2 = new Float32Array(
        new Uint32Array([(r2 << 16) | (g2 << 8) | b2]).buffer
      )[0];

      const data = createASCIIPCD(
        ["x", "y", "z", "rgb"],
        [
          [1.0, 2.0, 3.0, packed1],
          [4.0, 5.0, 6.0, packed2],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.rgb).toBeDefined();
      // 2 points * 3 components
      expect(result.attributes.rgb.length).toBe(6);

      // check first point color (red)
      expect(result.attributes.rgb[0]).toBeCloseTo(1.0, 1);
      expect(result.attributes.rgb[1]).toBeCloseTo(0.0, 1);
      expect(result.attributes.rgb[2]).toBeCloseTo(0.0, 1);

      // check second point color (green)
      expect(result.attributes.rgb[3]).toBeCloseTo(0.0, 1);
      expect(result.attributes.rgb[4]).toBeCloseTo(1.0, 1);
      expect(result.attributes.rgb[5]).toBeCloseTo(0.0, 1);
    });
  });

  describe("Normal attribute", () => {
    it("should parse ASCII PCD with normals", () => {
      const data = createASCIIPCD(
        ["x", "y", "z", "normal_x", "normal_y", "normal_z"],
        [
          [1.0, 2.0, 3.0, 0.0, 0.0, 1.0],
          [4.0, 5.0, 6.0, 1.0, 0.0, 0.0],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.normal_x).toEqual([0.0, 1.0]);
      expect(result.attributes.normal_y).toEqual([0.0, 0.0]);
      expect(result.attributes.normal_z).toEqual([1.0, 0.0]);
    });

    it("should parse Binary PCD with normals", () => {
      const data = createBinaryPCD(
        ["x", "y", "z", "normal_x", "normal_y", "normal_z"],
        [
          [1.0, 2.0, 3.0, 0.0, 0.0, 1.0],
          [4.0, 5.0, 6.0, 1.0, 0.0, 0.0],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.normal_x).toEqual([0.0, 1.0]);
      expect(result.attributes.normal_y).toEqual([0.0, 0.0]);
      expect(result.attributes.normal_z).toEqual([1.0, 0.0]);
    });
  });

  describe("Label attribute", () => {
    it("should parse ASCII PCD with labels", () => {
      const data = createASCIIPCD(
        ["x", "y", "z", "label"],
        [
          [1.0, 2.0, 3.0, 1],
          [4.0, 5.0, 6.0, 2],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.label).toEqual([1, 2]);
    });

    it("should parse Binary PCD with labels", () => {
      const data = createBinaryPCD(
        ["x", "y", "z", "label"],
        [
          [1.0, 2.0, 3.0, 1],
          [4.0, 5.0, 6.0, 2],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.label).toEqual([1, 2]);
    });
  });

  describe("Combined standard attributes", () => {
    it("should parse ASCII PCD with all standard attributes", () => {
      const r1 = 255,
        g1 = 0,
        b1 = 0;
      const packed1 = new Float32Array(
        new Uint32Array([(r1 << 16) | (g1 << 8) | b1]).buffer
      )[0];

      const data = createASCIIPCD(
        [
          "x",
          "y",
          "z",
          "intensity",
          "rgb",
          "normal_x",
          "normal_y",
          "normal_z",
          "label",
        ],
        [
          [1.0, 2.0, 3.0, 0.5, packed1, 0.0, 0.0, 1.0, 1],
          [4.0, 5.0, 6.0, 0.8, packed1, 1.0, 0.0, 0.0, 2],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.intensity).toEqual([0.5, 0.8]);
      expect(result.attributes.rgb).toBeDefined();
      expect(result.attributes.rgb.length).toBe(6);
      expect(result.attributes.normal_x).toEqual([0.0, 1.0]);
      expect(result.attributes.normal_y).toEqual([0.0, 0.0]);
      expect(result.attributes.normal_z).toEqual([1.0, 0.0]);
      expect(result.attributes.label).toEqual([1, 2]);
    });

    it("should parse Binary PCD with all standard attributes", () => {
      const data = createBinaryPCD(
        [
          "x",
          "y",
          "z",
          "intensity",
          "normal_x",
          "normal_y",
          "normal_z",
          "label",
        ],
        [
          [1.0, 2.0, 3.0, 0.5, 0.0, 0.0, 1.0, 1],
          [4.0, 5.0, 6.0, 0.8, 1.0, 0.0, 0.0, 2],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.intensity.length).toBe(2);
      expect(result.attributes.intensity[0]).toBeCloseTo(0.5, 6);
      expect(result.attributes.intensity[1]).toBeCloseTo(0.8, 6);
      expect(result.attributes.normal_x).toEqual([0.0, 1.0]);
      expect(result.attributes.normal_y).toEqual([0.0, 0.0]);
      expect(result.attributes.normal_z).toEqual([1.0, 0.0]);
      expect(result.attributes.label).toEqual([1, 2]);
    });
  });

  describe("Non-standard attributes", () => {
    it("should parse ASCII PCD with custom attributes", () => {
      const data = createASCIIPCD(
        ["x", "y", "z", "confidence", "temperature", "custom_field"],
        [
          [1.0, 2.0, 3.0, 0.95, 25.5, 42.0],
          [4.0, 5.0, 6.0, 0.87, 26.3, 43.0],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.confidence).toEqual([0.95, 0.87]);
      expect(result.attributes.temperature).toEqual([25.5, 26.3]);
      expect(result.attributes.custom_field).toEqual([42.0, 43.0]);
    });

    it("should parse Binary PCD with custom attributes", () => {
      const data = createBinaryPCD(
        ["x", "y", "z", "velocity_x", "velocity_y", "velocity_z", "timestamp"],
        [
          [1.0, 2.0, 3.0, 0.1, 0.2, 0.3, 1234567890],
          [4.0, 5.0, 6.0, 0.4, 0.5, 0.6, 1234567891],
        ],
        { types: { timestamp: "F" }, sizes: { timestamp: "8" } }
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.velocity_x.length).toBe(2);
      expect(result.attributes.velocity_x[0]).toBeCloseTo(0.1, 6);
      expect(result.attributes.velocity_x[1]).toBeCloseTo(0.4, 6);
      expect(result.attributes.velocity_y[0]).toBeCloseTo(0.2, 6);
      expect(result.attributes.velocity_y[1]).toBeCloseTo(0.5, 6);
      expect(result.attributes.velocity_z[0]).toBeCloseTo(0.3, 6);
      expect(result.attributes.velocity_z[1]).toBeCloseTo(0.6, 6);
      expect(result.attributes.timestamp).toEqual([1234567890, 1234567891]);
    });

    it("should parse mixed standard and non-standard attributes", () => {
      const data = createASCIIPCD(
        ["x", "y", "z", "intensity", "custom_score", "label", "sensor_id"],
        [
          [1.0, 2.0, 3.0, 0.5, 0.99, 1, 101],
          [4.0, 5.0, 6.0, 0.8, 0.75, 2, 102],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
      expect(result.attributes.intensity).toEqual([0.5, 0.8]);
      expect(result.attributes.custom_score).toEqual([0.99, 0.75]);
      expect(result.attributes.label).toEqual([1, 2]);
      expect(result.attributes.sensor_id).toEqual([101, 102]);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty point cloud", () => {
      const data = createASCIIPCD(["x", "y", "z"], []);

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([]);
      expect(result.attributes).toEqual({});
    });

    it("should handle single point", () => {
      const data = createASCIIPCD(
        ["x", "y", "z", "intensity"],
        [[1.0, 2.0, 3.0, 0.5]]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([1.0, 2.0, 3.0]);
      expect(result.attributes.intensity).toEqual([0.5]);
    });

    it("should handle attributes without position", () => {
      const data = createASCIIPCD(
        ["intensity", "label"],
        [
          [0.5, 1],
          [0.8, 2],
        ]
      );

      const result = parsePCDData(data, true);

      expect(result.position).toEqual([]);
      expect(result.attributes.intensity).toEqual([0.5, 0.8]);
      expect(result.attributes.label).toEqual([1, 2]);
    });
  });
});
