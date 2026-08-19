import * as THREE from "three";
import * as TSL from "three/tsl";

import type {
  PointCloudChannelArray,
  PointCloudChannelEncoding,
} from "../../../ir";
import { pointCloudChannelEncodingKey } from "../../../runtime/point-cloud-channel-encoding";
import type {
  PointCloudChannelNode,
  PointCloudChannelTslFacade,
  PointCloudColorVectorNode,
  PointCloudPositionNode,
} from "../../tsl-chainables";

interface PointCloudChannel {
  readonly encoding: PointCloudChannelEncoding;
  readonly values: PointCloudChannelArray;
}

/** Compact channel buffer and the descriptor required to read it in WGSL. */
export interface GpuPointCloudChannelResource {
  readonly attribute: THREE.BufferAttribute;
  encoding: PointCloudChannelEncoding;
  values: PointCloudChannelArray;
}

const channelTsl: PointCloudChannelTslFacade = TSL;

/** Creates a byte-preserving storage resource for one encoded channel. */
export function createGpuPointCloudChannelResource(
  channel: PointCloudChannel,
): GpuPointCloudChannelResource {
  return {
    attribute: new THREE.BufferAttribute(storageArray(channel.values), 1),
    encoding: channel.encoding,
    values: channel.values,
  };
}

/**
 * Rebinds frame values without widening them. A changed encoding returns a
 * replacement because the WGSL storage type/unpack topology is immutable.
 */
export function updateGpuPointCloudChannelResource(
  resource: GpuPointCloudChannelResource,
  channel: PointCloudChannel,
): GpuPointCloudChannelResource {
  if (
    pointCloudChannelEncodingKey(resource.encoding) !==
    pointCloudChannelEncodingKey(channel.encoding)
  ) {
    return createGpuPointCloudChannelResource(channel);
  }

  const array = storageArray(channel.values);
  resource.attribute.array = array;
  (resource.attribute as unknown as { count: number }).count = array.length;
  resource.attribute.needsUpdate = true;
  resource.encoding = channel.encoding;
  resource.values = channel.values;
  return resource;
}

/** Reads and decodes one scalar component from compact WGSL storage. */
export function gpuPointCloudChannelValueNode(
  resource: GpuPointCloudChannelResource,
  valueIndex: PointCloudPositionNode,
): PointCloudChannelNode {
  const encoding = resource.encoding;
  const stored = storedChannelValueNode(
    resource.attribute,
    encoding,
    valueIndex,
  );
  const decoded = channelTsl
    .float(stored)
    .mul(encoding.scale)
    .add(encoding.origin);
  if (encoding.invalidValue === null) {
    return decoded;
  }

  const invalid = integerNode(encoding, encoding.invalidValue);
  const nan = channelTsl.uintBitsToFloat(channelTsl.uint(0x7fc00000));
  return channelTsl.select(stored.equal(invalid), nan, decoded);
}

/** Reads the three RGB components associated with one sampled point. */
export function gpuPointCloudRgbNode(
  resource: GpuPointCloudChannelResource,
  sampleIndex: PointCloudPositionNode,
): PointCloudChannelNode & PointCloudColorVectorNode {
  if (resource.encoding.componentCount !== 3) {
    throw new Error("Point-cloud RGB resources require three components");
  }
  const offset = sampleIndex.mul(3);
  return channelTsl.vec3(
    gpuPointCloudChannelValueNode(resource, offset),
    gpuPointCloudChannelValueNode(resource, offset.add(1)),
    gpuPointCloudChannelValueNode(resource, offset.add(2)),
  );
}

/** Exact encoded bytes retained by the GPU resource. */
export function gpuPointCloudChannelResourceBytes(
  resource: GpuPointCloudChannelResource,
): number {
  return resource.values.byteLength;
}

function storedChannelValueNode(
  attribute: THREE.BufferAttribute,
  encoding: PointCloudChannelEncoding,
  valueIndex: PointCloudPositionNode,
): PointCloudChannelNode {
  if (encoding.storage === "float32") {
    return channelTsl
      .storage(attribute, "float", attribute.count)
      .toReadOnly()
      .element(valueIndex);
  }
  if (encoding.storage === "int32") {
    return channelTsl
      .storage(attribute, "int", attribute.count)
      .toReadOnly()
      .element(valueIndex);
  }
  if (encoding.storage === "uint32") {
    return channelTsl
      .storage(attribute, "uint", attribute.count)
      .toReadOnly()
      .element(valueIndex);
  }

  const bits = encoding.storage.endsWith("8") ? 8 : 16;
  const valuesPerWord = 32 / bits;
  const word = channelTsl
    .storage(attribute, "uint", attribute.count)
    .toReadOnly()
    .element(valueIndex.div(valuesPerWord));
  const raw = word
    .shiftRight(valueIndex.mod(valuesPerWord).mul(bits))
    .bitAnd(2 ** bits - 1);
  if (encoding.storage.startsWith("uint")) {
    return raw;
  }

  const signExtension = 32 - bits;
  return channelTsl.int(raw.shiftLeft(signExtension)).shiftRight(signExtension);
}

function integerNode(
  encoding: PointCloudChannelEncoding,
  value: number,
): PointCloudChannelNode {
  if (encoding.storage === "float32") {
    return channelTsl.float(value);
  }
  return encoding.storage.startsWith("int")
    ? channelTsl.int(value)
    : channelTsl.uint(value);
}

function storageArray(values: PointCloudChannelArray): THREE.TypedArray {
  if (
    values instanceof Float32Array ||
    values instanceof Int32Array ||
    values instanceof Uint32Array
  ) {
    return values;
  }

  const paddedByteLength = Math.ceil(values.byteLength / 4) * 4;
  if (values.byteOffset % 4 === 0 && values.byteLength === paddedByteLength) {
    return new Uint32Array(
      values.buffer,
      values.byteOffset,
      values.byteLength / 4,
    );
  }

  const padded = new Uint8Array(paddedByteLength);
  padded.set(
    new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
  );
  return new Uint32Array(padded.buffer);
}
