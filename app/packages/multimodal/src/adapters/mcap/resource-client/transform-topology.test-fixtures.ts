import { McapWriter } from "@mcap/core";
import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import type { McapReadable } from "../reader";

export interface TransformTopologyFixture {
  readonly frameUseTopics: readonly string[];
  readonly readable: McapReadable;
  readonly sizeBytes: string;
}

interface FixtureWriter {
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
    readonly metadata: ReadonlyMap<string, string>;
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

interface FixtureWriterConstructor {
  new (options: { readonly writable: MemoryMcapBuffer }): FixtureWriter;
}

function mcapWriterConstructor(): FixtureWriterConstructor {
  const candidate: unknown = McapWriter;
  if (!isWriterConstructor(candidate)) {
    throw new Error("@mcap/core did not expose McapWriter");
  }
  return candidate;
}

function isWriterConstructor(
  value: unknown,
): value is FixtureWriterConstructor {
  return typeof value === "function";
}

/** Small connected MCAP with static and temporal evidence. */
export async function buildHealthyTransformTopologyMcap(): Promise<TransformTopologyFixture> {
  return buildTransformTopologyMcap({ disconnected: false });
}

/** Small MCAP with two data-relevant transform islands. */
export async function buildDisconnectedTransformTopologyMcap(): Promise<TransformTopologyFixture> {
  return buildTransformTopologyMcap({ disconnected: true });
}

async function buildTransformTopologyMcap({
  disconnected,
}: {
  readonly disconnected: boolean;
}): Promise<TransformTopologyFixture> {
  const buffer = new MemoryMcapBuffer();
  const writer = new (mcapWriterConstructor())({ writable: buffer });
  await writer.start({
    library: "multimodal-transform-topology-test",
    profile: "",
  });
  const schemaId = await writer.registerSchema({
    data: frameTransformSchemaData(),
    encoding: "protobuf",
    name: "foxglove.FrameTransform",
  });
  const staticChannel = await writer.registerChannel({
    messageEncoding: "protobuf",
    metadata: new Map(),
    schemaId,
    topic: "/tf_static",
  });
  const temporalChannel = await writer.registerChannel({
    messageEncoding: "protobuf",
    metadata: new Map(),
    schemaId,
    topic: "/tf",
  });
  const poseSchemaId = await writer.registerSchema({
    data: frameTransformSchemaData(),
    encoding: "protobuf",
    name: "foxglove.PoseInFrame",
  });
  const mapPoseChannel = await writer.registerChannel({
    messageEncoding: "protobuf",
    metadata: new Map(),
    schemaId: poseSchemaId,
    topic: "/pose/map",
  });
  const cameraPoseChannel = disconnected
    ? await writer.registerChannel({
        messageEncoding: "protobuf",
        metadata: new Map(),
        schemaId: poseSchemaId,
        topic: "/pose/camera",
      })
    : null;
  await writer.addMessage({
    channelId: staticChannel,
    data: encodeTransform("map", "base_link"),
    logTime: 1_000_000_000n,
    publishTime: 1_000_000_000n,
    sequence: 1,
  });
  await writer.addMessage({
    channelId: mapPoseChannel,
    data: encodePose("map"),
    logTime: 1_250_000_000n,
    publishTime: 1_250_000_000n,
    sequence: 1,
  });
  const frameUseTopics = ["/pose/map"];
  if (cameraPoseChannel !== null) {
    await writer.addMessage({
      channelId: staticChannel,
      data: encodeTransform("world", "camera"),
      logTime: 1_500_000_000n,
      publishTime: 1_500_000_000n,
      sequence: 2,
    });
    frameUseTopics.push("/pose/camera");
    await writer.addMessage({
      channelId: cameraPoseChannel,
      data: encodePose("camera"),
      logTime: 1_750_000_000n,
      publishTime: 1_750_000_000n,
      sequence: 1,
    });
  }
  await writer.addMessage({
    channelId: temporalChannel,
    data: encodeTransform("base_link", "lidar", 2),
    logTime: 2_000_000_000n,
    publishTime: 2_000_000_000n,
    sequence: 1,
  });
  await writer.addMessage({
    channelId: temporalChannel,
    data: encodeTransform("base_link", "lidar", 3),
    logTime: 3_000_000_000n,
    publishTime: 3_000_000_000n,
    sequence: 2,
  });
  await writer.end();
  return {
    frameUseTopics,
    readable: buffer,
    sizeBytes: String(await buffer.size()),
  };
}

function encodeTransform(
  parentFrameId: string,
  childFrameId: string,
  seconds?: number,
): Uint8Array {
  return FRAME_TRANSFORM_TYPE.encode({
    childFrameId,
    parentFrameId,
    rotation: { w: 1, x: 0, y: 0, z: 0 },
    ...(seconds !== undefined ? { timestamp: { nanos: 0, seconds } } : {}),
    translation: { x: 0, y: 0, z: 0 },
  }).finish();
}

function encodePose(frameId: string): Uint8Array {
  return POSE_IN_FRAME_TYPE.encode({ frameId }).finish();
}

class MemoryMcapBuffer implements McapReadable {
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
        PoseInFrame: {
          fields: {
            frameId: { id: 2, type: "string" },
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
const POSE_IN_FRAME_TYPE = FRAME_TRANSFORM_ROOT.lookupType(
  "foxglove.PoseInFrame",
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
