import { parse, Root } from "protobufjs";
import { describe, expect, it } from "vitest";
import { decodeFoxgloveCompressedImagePayload } from "./foxglove-compressed-image-decoder";
import { BUILTIN_SCHEMA_CODEC_REGISTRY } from "./schema-codec-registry";

const root = new Root();
parse(
  `syntax = "proto3";
package google.protobuf;

message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}`,
  root
);
parse(
  `syntax = "proto3";
package foxglove;

message CompressedImage {
  google.protobuf.Timestamp timestamp = 1;
  bytes data = 2;
  string format = 3;
  string frame_id = 4;
}`,
  root
);
root.resolveAll();

const compressedImageType = root.lookupType("foxglove.CompressedImage");

function createCompressedImagePayload() {
  return compressedImageType
    .encode(
      compressedImageType.create({
        data: Uint8Array.from([1, 2, 3, 4]),
        format: "jpeg",
        frameId: "camera",
        timestamp: { seconds: 1, nanos: 2 },
      })
    )
    .finish();
}

describe("foxglove compressed image decoder", () => {
  it("decodes Foxglove protobuf compressed-image payloads", () => {
    const decoded = decodeFoxgloveCompressedImagePayload(
      createCompressedImagePayload()
    );

    expect(decoded.format).toBe("jpeg");
    expect(decoded.frameId).toBe("camera");
    expect(decoded.compressedBytes).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it("registers Foxglove compressed-image decoding in the schema registry", async () => {
    const decoded = await BUILTIN_SCHEMA_CODEC_REGISTRY.decodeImageMessage(
      "foxglove.CompressedImage",
      {
        logTimeNs: 10,
        messageId: "image-1",
        payload: createCompressedImagePayload(),
        publishTimeNs: 11,
        syncTimestampNs: 10,
      }
    );

    expect(decoded.format).toBe("jpeg");
    expect(decoded.frameId).toBe("camera");
    expect(decoded.compressedBytes).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });
});
