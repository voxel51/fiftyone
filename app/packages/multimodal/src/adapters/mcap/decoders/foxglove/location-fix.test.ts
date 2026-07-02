import { beforeEach, describe, expect, it, vi } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import { foxgloveLocationFixDecoder } from "./location-fix";
import { decodeProtobufMessage } from "./protobuf";

vi.mock("./protobuf", () => ({
  decodeProtobufMessage: vi.fn(),
}));

const EMPTY_BYTES = new Uint8Array(0);
const mockDecode = vi.mocked(decodeProtobufMessage);

beforeEach(() => {
  mockDecode.mockReset();
});

describe("foxgloveLocationFixDecoder", () => {
  it("declares the foxglove.LocationFix payload descriptor", () => {
    expect(foxgloveLocationFixDecoder.payload).toMatchObject({
      encoding: "protobuf",
      schema: "foxglove.LocationFix",
      schemaEncoding: "protobuf",
    });
  });

  it("decodes NuScenes-style fixes with only latitude/longitude", () => {
    mockDecode.mockReturnValue({
      latitude: 42.349205,
      longitude: -71.045759,
      timestamp: { nanos: 34n, seconds: 12n },
    });

    const { attributes, timing, visualization } =
      foxgloveLocationFixDecoder.decode(EMPTY_BYTES, {});

    expect(visualization?.kind).toBe(VISUALIZATION_KIND.LOCATION);
    if (visualization?.kind !== VISUALIZATION_KIND.LOCATION) {
      throw new Error("Expected location visualization");
    }
    expect(visualization).toMatchObject({
      latitude: 42.349205,
      longitude: -71.045759,
      timestampNs: 12_000_000_034n,
    });
    expect(visualization.altitude).toBeUndefined();
    expect(visualization.positionCovariance).toBeUndefined();
    expect(attributes).toMatchObject({
      latitude: 42.349205,
      longitude: -71.045759,
    });
    expect(timing?.sourceTimestamps?.messageTime).toBe(12_000_000_034n);
  });

  it("keeps altitude, frame id, and well-formed covariance", () => {
    mockDecode.mockReturnValue({
      altitude: 12.5,
      frameId: "gps",
      latitude: 1.29,
      longitude: 103.78,
      positionCovariance: [1, 0, 0, 0, 1, 0, 0, 0, 4],
    });

    const { visualization } = foxgloveLocationFixDecoder.decode(
      EMPTY_BYTES,
      {},
    );
    if (visualization?.kind !== VISUALIZATION_KIND.LOCATION) {
      throw new Error("Expected location visualization");
    }
    expect(visualization).toMatchObject({
      altitude: 12.5,
      coordinateFrameId: "gps",
      positionCovariance: [1, 0, 0, 0, 1, 0, 0, 0, 4],
    });
  });

  it("drops malformed covariance and rejects non-finite coordinates", () => {
    mockDecode.mockReturnValue({
      latitude: 1,
      longitude: 2,
      positionCovariance: [1, 2, 3],
    });
    const { visualization } = foxgloveLocationFixDecoder.decode(
      EMPTY_BYTES,
      {},
    );
    if (visualization?.kind !== VISUALIZATION_KIND.LOCATION) {
      throw new Error("Expected location visualization");
    }
    expect(visualization.positionCovariance).toBeUndefined();

    mockDecode.mockReturnValue({ latitude: Number.NaN, longitude: 2 });
    expect(() => foxgloveLocationFixDecoder.decode(EMPTY_BYTES, {})).toThrow(
      "Location fix has no finite latitude/longitude",
    );
  });
});
