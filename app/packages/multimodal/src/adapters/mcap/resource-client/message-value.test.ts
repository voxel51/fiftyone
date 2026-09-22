import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import { describe, expect, it } from "vitest";
import type { McapIndexedReaderLike } from "../reader";
import { genericRecordDecoderForChannel } from "./generic-record-decoder";
import { messageValue } from "./message-value";

describe("full transformation message values", () => {
  it("preserves protobuf defaults, field spelling, uint64 and bytes through cloning", () => {
    const root = Root.fromJSON({
      nested: {
        Pose: {
          fields: {
            object_id: { id: 1, type: "uint64" },
            z: { id: 2, type: "double" },
            visible: { id: 3, type: "bool" },
            bytes: { id: 4, type: "bytes" },
            points: { id: 5, type: "double", rule: "repeated" },
          },
        },
      },
    });
    const data = descriptor.FileDescriptorSet.encode(
      (
        root as unknown as {
          toDescriptor(
            version: string,
          ): Parameters<typeof descriptor.FileDescriptorSet.encode>[0];
        }
      ).toDescriptor("proto3"),
    ).finish();
    const type = root.lookupType("Pose");
    const channel = {
      id: 1,
      type: "Channel" as const,
      topic: "poses",
      schemaId: 1,
      messageEncoding: "protobuf",
      metadata: new Map<string, string>(),
    };
    const reader: McapIndexedReaderLike = {
      channelsById: new Map([[1, channel]]),
      schemasById: new Map([
        [
          1,
          { id: 1, type: "Schema", name: "Pose", encoding: "protobuf", data },
        ],
      ]),
      chunkIndexes: [],
      readMessages: async function* () {
        yield* [];
      },
    };
    const decode = genericRecordDecoderForChannel(reader, channel, {
      defaults: true,
    });
    if (!decode) throw new Error("fixture decoder missing");
    const encoded = type
      .encode(
        type.fromObject({ object_id: "18446744073709551615", bytes: [0, 255] }),
      )
      .finish();
    expect(messageValue(decode(encoded))).toEqual({
      object_id: 18446744073709551615n,
      z: 0,
      visible: false,
      bytes: new Uint8Array([0, 255]),
      points: [],
    });
  });
  it("rejects excessive depth and expansion before transferring to a script", () => {
    let value: unknown = {};
    for (let i = 0; i < 66; i++) value = { child: value };
    expect(() => messageValue(value)).toThrow(/budget/);
    expect(() => messageValue(Array(200001).fill(0))).toThrow(/budget/);
  });
});
