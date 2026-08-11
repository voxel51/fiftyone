import { McapWriter, type McapTypes } from "@mcap/core";
import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import { describe, expect, it } from "vitest";
import { rawNodeToJson } from "../../../ir/index";
import { createDecodeClient } from "../../../query/decoding/index";
import { createDefaultMcapReader } from "../reader/index";
import { createMcapDecoderRegistry } from "../message-decoders/index";
import { resolveMcapTimelineStrategy } from "./timeline";
import { readMcapFrameTransformWindow } from "./operations/read-frame-transforms";
import { readMcapRawMessageRecord } from "./operations/read-raw-message-record";
import { readMcapSynchronizedMessageBatch } from "./operations/read-synchronized-message-batch";

const source = {
  sourceId: "non-indexed-fixture",
  url: "memory://non-indexed-production-contract.mcap",
};
const timeline = resolveMcapTimelineStrategy(undefined);

describe("non-indexed MCAP production contract", () => {
  it("serves raw predecessor, raw-message, and transform fallback lanes", async () => {
    const fixture = await createNonIndexedMcapFixture();
    const reader = await createDefaultMcapReader(source, fixture);

    expect("readIndexedMessageTimes" in reader).toBe(false);
    expect("readLatestIndexedMessageTimes" in reader).toBe(false);
    expect("readIndexedMessages" in reader).toBe(false);

    const raw = await readMcapRawMessageRecord({
      reader,
      request: { source, timeNs: 15_000_000_000n, topic: "/pose" },
      timeline,
    });
    expect(raw.status).toBe("ok");
    expect(raw.logTimeNs).toBe(0n);
    expect(raw.root && rawNodeToJson(raw.root)).toMatchObject({
      position: { x: 1, y: 2, z: 3 },
    });

    const decodeClient = createDecodeClient({
      cache: {
        enabled: false,
        clear() {
          return Promise.resolve();
        },
        get() {
          return Promise.resolve(undefined);
        },
        put() {
          return Promise.resolve();
        },
      },
      registry: createMcapDecoderRegistry(),
    });
    const windows = await readMcapSynchronizedMessageBatch({
      decodeClient,
      reader,
      request: {
        source,
        timeNs: [2_000_000_000n],
        topics: ["/pose"],
      },
      timeline,
    });
    expect(windows[0]?.messagesByTopic["/pose"]?.[0]?.timelineTimeNs).toBe(0n);

    const transforms = await readMcapFrameTransformWindow({
      reader,
      request: {
        endTimeNs: 2_000_000_000n,
        source,
        startTimeNs: 1_000_000_000n,
      },
      timeline,
    });
    expect(transforms.samples).toHaveLength(1);
    expect(transforms.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
    // A schema-qualified channel with one transform is static even when the
    // source payload carries a timestamp.
    expect(transforms.samples[0]?.timeNs).toBeUndefined();

    reader.dispose?.();
  });
});

async function createNonIndexedMcapFixture(): Promise<MemoryMcapBuffer> {
  const buffer = new MemoryMcapBuffer();
  const Writer = McapWriter as unknown as McapWriterConstructor;
  const writer = new Writer({
    useMessageIndex: false,
    writable: buffer,
  });
  await writer.start({ library: "multimodal-test", profile: "" });

  const poseSchemaId = await writer.registerSchema({
    data: new TextEncoder().encode("{}"),
    encoding: "jsonschema",
    name: "Pose",
  });
  const poseChannelId = await writer.registerChannel({
    messageEncoding: "json",
    metadata: new Map(),
    schemaId: poseSchemaId,
    topic: "/pose",
  });

  const transformSchemaId = await writer.registerSchema({
    data: frameTransformSchemaData(),
    encoding: "protobuf",
    name: "foxglove.FrameTransform",
  });
  const transformChannelId = await writer.registerChannel({
    messageEncoding: "protobuf",
    metadata: new Map(),
    schemaId: transformSchemaId,
    topic: "/tf",
  });

  await writer.addMessage({
    channelId: poseChannelId,
    data: new TextEncoder().encode(
      JSON.stringify({ position: { x: 1, y: 2, z: 3 } }),
    ),
    logTime: 0n,
    publishTime: 0n,
    sequence: 1,
  });
  await writer.addMessage({
    channelId: transformChannelId,
    data: FRAME_TRANSFORM_TYPE.encode({
      childFrameId: "lidar",
      parentFrameId: "map",
      rotation: { w: 1, x: 0, y: 0, z: 0 },
      timestamp: { nanos: 500_000_000, seconds: 1 },
      translation: { x: 1, y: 2, z: 3 },
    }).finish(),
    logTime: 1_500_000_000n,
    publishTime: 1_500_000_000n,
    sequence: 1,
  });
  await writer.end();
  return buffer;
}

class MemoryMcapBuffer implements McapTypes.IReadable, McapTypes.IWritable {
  private bytes = new Uint8Array();

  position(): bigint {
    return BigInt(this.bytes.byteLength);
  }

  read(offset: bigint, size: bigint): Promise<Uint8Array> {
    return Promise.resolve(
      this.bytes.subarray(Number(offset), Number(offset + size)),
    );
  }

  size(): Promise<bigint> {
    return Promise.resolve(BigInt(this.bytes.byteLength));
  }

  write(data: Uint8Array): Promise<void> {
    const combined = new Uint8Array(this.bytes.byteLength + data.byteLength);
    combined.set(this.bytes);
    combined.set(data, this.bytes.byteLength);
    this.bytes = combined;
    return Promise.resolve();
  }
}

interface McapWriterLike {
  addMessage(message: {
    readonly channelId: number;
    readonly data: Uint8Array;
    readonly logTime: bigint;
    readonly publishTime: bigint;
    readonly sequence: number;
  }): Promise<void>;
  end(): Promise<void>;
  registerChannel(channel: {
    readonly messageEncoding: string;
    readonly metadata: Map<string, string>;
    readonly schemaId: number;
    readonly topic: string;
  }): Promise<number>;
  registerSchema(schema: {
    readonly data: Uint8Array;
    readonly encoding: string;
    readonly name: string;
  }): Promise<number>;
  start(header: {
    readonly library: string;
    readonly profile: string;
  }): Promise<void>;
}

interface McapWriterConstructor {
  new (options: {
    readonly useMessageIndex: boolean;
    readonly writable: McapTypes.IWritable;
  }): McapWriterLike;
}

const FRAME_TRANSFORM_ROOT = Root.fromJSON({
  nested: {
    foxglove: {
      nested: {
        FrameTransform: {
          fields: {
            childFrameId: { id: 3, type: "string" },
            parentFrameId: { id: 2, type: "string" },
            rotation: { id: 5, type: "Quaternion" },
            timestamp: { id: 1, type: "Timestamp" },
            translation: { id: 4, type: "Vector3" },
          },
        },
        Quaternion: {
          fields: {
            w: { id: 4, type: "double" },
            x: { id: 1, type: "double" },
            y: { id: 2, type: "double" },
            z: { id: 3, type: "double" },
          },
        },
        Timestamp: {
          fields: {
            nanos: { id: 2, type: "int32" },
            seconds: { id: 1, type: "int64" },
          },
        },
        Vector3: {
          fields: {
            x: { id: 1, type: "double" },
            y: { id: 2, type: "double" },
            z: { id: 3, type: "double" },
          },
        },
      },
    },
  },
});
const FRAME_TRANSFORM_TYPE = FRAME_TRANSFORM_ROOT.lookupType(
  "foxglove.FrameTransform",
);

function frameTransformSchemaData(): Uint8Array {
  return descriptor.FileDescriptorSet.encode(
    (
      FRAME_TRANSFORM_ROOT as unknown as {
        toDescriptor(
          version: string,
        ): Parameters<typeof descriptor.FileDescriptorSet.encode>[0];
      }
    ).toDescriptor("proto3"),
  ).finish();
}
