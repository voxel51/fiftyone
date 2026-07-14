import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import { foxglovePoseInFrameDecoder } from "./pose-in-frame";
import { decodeProtobufMessage } from "./protobuf";

vi.mock("./protobuf", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const mockDecode = vi.mocked(decodeProtobufMessage);

beforeEach(() => {
  mockDecode.mockReset();
});

describe("foxglovePoseInFrameDecoder", () => {
  it("declares the foxglove.PoseInFrame payload descriptor", () => {
    expect(foxglovePoseInFrameDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.PoseInFrame",
      schemaEncoding: "protobuf",
    });
  });

  it("decodes framed poses with timestamps", () => {
    mockDecode.mockReturnValue({
      frameId: "map",
      pose: {
        orientation: { w: 0.707, x: 0, y: 0, z: 0.707 },
        position: { x: 995, y: 1375, z: 0.5 },
      },
      timestamp: { nanos: 34n, seconds: 12n },
    });

    const { attributes, timing, visualization } =
      foxglovePoseInFrameDecoder.decode(EMPTY_BYTES, {});

    expect(visualization?.kind).toBe(VISUALIZATION_KIND.POSE);
    if (visualization?.kind !== VISUALIZATION_KIND.POSE) {
      throw new Error("Expected pose visualization");
    }
    expect(visualization).toMatchObject({
      coordinateFrameId: "map",
      position: [995, 1375, 0.5],
      quaternion: [0, 0, 0.707, 0.707],
      timestampNs: 12_000_000_034n,
    });
    expect(visualization.velocity).toBeUndefined();
    expect(attributes).toMatchObject({ frameId: "map" });
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("defaults empty poses to the identity at the origin", () => {
    // NuScenes /pose messages carry an identity pose in base_link; the
    // decoder must not invent data for them.
    mockDecode.mockReturnValue({
      frameId: "base_link",
      pose: { orientation: { w: 1 } },
    });

    const { visualization } = foxglovePoseInFrameDecoder.decode(
      EMPTY_BYTES,
      {},
    );
    if (visualization?.kind !== VISUALIZATION_KIND.POSE) {
      throw new Error("Expected pose visualization");
    }
    expect(visualization.position).toEqual([0, 0, 0]);
    expect(visualization.quaternion).toEqual([0, 0, 0, 1]);
  });
});
