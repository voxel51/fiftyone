import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { foxgloveSceneUpdateDecoder } from "./scene-update";

vi.mock("./protobuf", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const mockDecode = vi.mocked(decodeProtobufMessage);

beforeEach(() => {
  mockDecode.mockReturnValue({ deletions: [], entities: [] });
});

describe("foxgloveSceneUpdateDecoder", () => {
  it("declares the foxglove.SceneUpdate payload descriptor", () => {
    expect(foxgloveSceneUpdateDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.SceneUpdate",
      schemaEncoding: "protobuf",
    });
  });

  it("decodes cube entities and preserves primitive counts", () => {
    mockDecode.mockReturnValue({
      deletions: [],
      entities: [
        {
          id: "box-1",
          frameId: "LIDAR_TOP",
          frameLocked: true,
          timestamp: timestamp(12n, 34n),
          lifetime: { seconds: 2n, nanos: 5n },
          metadata: [{ key: "class", value: "car" }],
          arrows: [{}],
          cubes: [
            {
              pose: {
                position: { x: 1, y: 2, z: 3 },
                orientation: { x: 0, y: 0, z: 0.707, w: 0.707 },
              },
              size: { x: 4, y: 5, z: 6 },
              color: { r: 0.1, g: 0.2, b: 0.3, a: 0.4 },
            },
          ],
          lines: [{}, {}],
        },
      ],
    });

    const { attributes, timing, visualization } =
      foxgloveSceneUpdateDecoder.decode(EMPTY_BYTES, {});

    expect(visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    if (visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) {
      throw new Error("Expected SceneUpdate visualization");
    }

    expect(visualization.entities).toHaveLength(1);
    expect(visualization.entities[0]).toMatchObject({
      arrowCount: 1,
      cubeCount: 1,
      frameId: "LIDAR_TOP",
      frameLocked: true,
      id: "box-1",
      lineCount: 2,
      lifetimeNs: 2_000_000_005n,
      metadata: { class: "car" },
      timestampNs: 12_000_000_034n,
    });
    expect(visualization.entities[0]?.cubes[0]).toEqual({
      color: [0.1, 0.2, 0.3, 0.4],
      pose: {
        position: [1, 2, 3],
        quaternion: [0, 0, 0.707, 0.707],
      },
      size: [4, 5, 6],
    });
    expect(attributes).toMatchObject({
      cubeCount: 1,
      entityCount: 1,
      lineCount: 2,
      unsupportedPrimitiveCount: 3,
    });
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("decodes all-entity deletions", () => {
    mockDecode.mockReturnValue({
      deletions: [{ id: "ignored", timestamp: timestamp(4n), type: "ALL" }],
      entities: [],
    });

    const { visualization, timing } = foxgloveSceneUpdateDecoder.decode(
      EMPTY_BYTES,
      {},
    );

    expect(visualization?.kind).toBe(VISUALIZATION_KIND.SCENE_UPDATE);
    if (visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) {
      throw new Error("Expected SceneUpdate visualization");
    }
    expect(visualization.deletions).toEqual([
      { id: "ignored", timestampNs: 4_000_000_000n, type: "all" },
    ]);
    expect(timing?.sourceTimestamps?.messageTime).toBe(4_000_000_000n);
  });
});

function timestamp(seconds: bigint, nanos = 0n) {
  return { seconds, nanos };
}
