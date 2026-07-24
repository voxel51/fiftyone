import * as TSL from "three/tsl";
import { describe, expect, it } from "vitest";

import {
  POINT_CLOUD_RGB_ENCODING,
  pointCloudNativeIntegerScalarEncoding,
} from "../../../ir";
import {
  createGpuPointCloudChannelResource,
  gpuPointCloudChannelResourceBytes,
  gpuPointCloudChannelValueNode,
  gpuPointCloudRgbNode,
  updateGpuPointCloudChannelResource,
} from "./gpu-point-cloud-channel-nodes";
import type { GpuPointCloudNode } from "./gpu-point-cloud-position-nodes";

const channelTestTsl = TSL as unknown as {
  uint(value: number): GpuPointCloudNode;
};

describe("GPU pointcloud encoded channel nodes", () => {
  it("keeps RGB bytes packed and emits byte extraction reads", () => {
    const values = Uint8Array.of(255, 128, 64, 0, 32, 255, 16, 8, 4, 3, 2, 1);
    const resource = createGpuPointCloudChannelResource({
      encoding: POINT_CLOUD_RGB_ENCODING,
      values,
    });
    const node = gpuPointCloudRgbNode(resource, uintNode(1));

    expect(resource.values).toBe(values);
    expect(resource.values).toBeInstanceOf(Uint8Array);
    expect(resource.attribute.array).toBeInstanceOf(Uint32Array);
    expect(resource.attribute.array.byteLength).toBe(values.byteLength);
    expect(gpuPointCloudChannelResourceBytes(resource)).toBe(values.byteLength);
    expect(nodeOperators(node)).toEqual(
      expect.arrayContaining([">>", "&", "%", "*", "+"]),
    );
    expect(nodeConstantValues(node)).toEqual(
      expect.arrayContaining([3, 4, 8, 255, 1 / 255]),
    );
  });

  it("keeps signed 16-bit values packed and sign-extends shader reads", () => {
    const values = Int16Array.of(-32_768, -1, 42, 32_767);
    const encoding = pointCloudNativeIntegerScalarEncoding("int16");
    const resource = createGpuPointCloudChannelResource({ encoding, values });
    const node = gpuPointCloudChannelValueNode(resource, uintNode(2));

    expect(resource.values).toBe(values);
    expect(resource.values).toBeInstanceOf(Int16Array);
    expect(resource.attribute.array).toBeInstanceOf(Uint32Array);
    expect(resource.attribute.array.byteLength).toBe(values.byteLength);
    expect(nodeOperators(node)).toEqual(
      expect.arrayContaining([">>", "<<", "&", "%"]),
    );
    expect(nodeConstantValues(node)).toEqual(
      expect.arrayContaining([2, 16, 65_535]),
    );
  });

  it("rebinds matching native storage and replaces changed encodings", () => {
    const encoding = pointCloudNativeIntegerScalarEncoding("uint16");
    const first = createGpuPointCloudChannelResource({
      encoding,
      values: Uint16Array.of(1, 2),
    });
    const rebound = updateGpuPointCloudChannelResource(first, {
      encoding,
      values: Uint16Array.of(3, 4),
    });
    const replacement = updateGpuPointCloudChannelResource(rebound, {
      encoding: pointCloudNativeIntegerScalarEncoding("uint8"),
      values: Uint8Array.of(3, 4, 5, 6),
    });

    expect(rebound).toBe(first);
    expect(rebound.values).toBeInstanceOf(Uint16Array);
    expect(replacement).not.toBe(first);
    expect(replacement.values).toBeInstanceOf(Uint8Array);
  });
});

function uintNode(value: number): GpuPointCloudNode {
  return channelTestTsl.uint(value);
}

function serializedNodes(node: TSL.Node): readonly SerializedNode[] {
  const serialized = (node as unknown as { toJSON(): unknown }).toJSON() as {
    readonly nodes?: readonly SerializedNode[];
  };
  return serialized.nodes ?? [];
}

function nodeOperators(node: TSL.Node): unknown[] {
  return serializedNodes(node)
    .filter((candidate) => candidate.type === "OperatorNode")
    .map((candidate) => candidate.op);
}

function nodeConstantValues(node: TSL.Node): unknown[] {
  return serializedNodes(node)
    .filter((candidate) => candidate.type === "ConstNode")
    .map((candidate) => candidate.value);
}

interface SerializedNode {
  readonly op?: unknown;
  readonly type?: string;
  readonly value?: unknown;
}
