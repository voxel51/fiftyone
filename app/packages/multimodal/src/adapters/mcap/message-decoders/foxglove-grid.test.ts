import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { foxgloveGridDecoder } from "./foxglove/index";
import { GRID_FIXTURE } from "./foxglove.test-fixtures";
import { gridWireMessage } from "./foxglove.test-helpers";

describe("Foxglove grid decoders", () => {
  it("decodes protobuf grid payloads into grid visualizations", () => {
    // One 2x1 cell grid packed alpha,blue,green,red per cell — the NuScenes
    // /map channel order — exercising the full protobuf wire path.
    const data = Uint8Array.of(255, 10, 20, 30, 128, 40, 50, 60);
    const output = foxgloveGridDecoder.decode(
      gridWireMessage({
        cellStride: 4,
        columnCount: 2,
        data,
        fields: [
          { name: "alpha", offset: 0, type: 1 },
          { name: "blue", offset: 1, type: 1 },
          { name: "green", offset: 2, type: 1 },
          { name: "red", offset: 3, type: 1 },
        ],
        rowStride: 8,
      }),
      {
        schemaData: GRID_FIXTURE.schemaData,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/map",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.GRID);
    if (output.visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(output.visualization.columnCount).toBe(2);
    expect(output.visualization.rowCount).toBe(1);
    expect(output.visualization.cellSize).toEqual([0.1, 0.1]);
    expect(output.visualization.coordinateFrameId).toBe("map");
    expect(output.visualization.pose.position).toEqual([920, 1300, 0.5]);
    expect(Array.from(output.visualization.rgba)).toEqual([
      30, 20, 10, 255, 60, 50, 40, 128,
    ]);
    expect(output.attributes).toMatchObject({
      colorMode: "color",
      columnCount: 2,
      frameId: "map",
      rowCount: 1,
    });
    expect(output.timing?.timeRange?.startNs).toBe(10n);
  });

  it("decodes protobuf scalar grid payloads into translucent masks", () => {
    const output = foxgloveGridDecoder.decode(
      gridWireMessage({
        cellStride: 1,
        columnCount: 2,
        data: Uint8Array.of(0, 1),
        fields: [{ name: "drivable_area", offset: 0, type: 1 }],
        rowStride: 2,
      }),
      {
        schemaData: GRID_FIXTURE.schemaData,
      },
    );

    expect(output.visualization?.kind).toBe(VISUALIZATION_KIND.GRID);
    if (output.visualization?.kind !== VISUALIZATION_KIND.GRID) {
      throw new Error("Expected grid visualization");
    }
    expect(output.attributes?.colorMode).toBe("scalar");
    expect(Array.from(output.visualization.rgba)).toEqual([
      255, 255, 255, 0, 255, 255, 255, 153,
    ]);
  });
});
