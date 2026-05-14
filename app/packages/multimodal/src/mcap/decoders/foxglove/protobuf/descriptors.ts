/**
 * Protobuf descriptor conversion helpers for Foxglove MCAP schemas.
 *
 * MCAP stores protobuf schemas as binary FileDescriptorSet payloads. This file
 * keeps the protobufjs descriptor interop in one place so concrete decoders only
 * deal with Root/message lookup.
 */
import * as protobufjs from "protobufjs";
import * as descriptorModule from "protobufjs/ext/descriptor/index.js";
import type { IFileDescriptorSet } from "protobufjs/ext/descriptor/index.js";

type ProtobufDescriptorModule =
  typeof import("protobufjs/ext/descriptor/index.js");
type ProtobufJsModule = typeof import("protobufjs");

const protobufjsRuntime = unwrapDefaultExport<ProtobufJsModule>(protobufjs);
const descriptor =
  unwrapDefaultExport<ProtobufDescriptorModule>(descriptorModule);
const FileDescriptorSet = descriptor.FileDescriptorSet;

// protobufjs ships descriptor helpers without complete TypeScript coverage.
declare module "protobufjs" {
  interface ReflectionObject {
    toDescriptor(
      protoVersion: string
    ): protobufjs.Message<IFileDescriptorSet> & IFileDescriptorSet;
  }

  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReflectionObject {
    const fromDescriptor: (
      descriptorSet: protobufjs.Message
    ) => protobufjs.Root;
  }
}

/**
 * Protobufjs descriptor object emitted from a Root.
 */
export type ProtobufDescriptor = ReturnType<protobufjs.Root["toDescriptor"]>;

/**
 * Convert a protobufjs Root into a proto3 descriptor set.
 */
export function protobufToDescriptor(
  root: protobufjs.Root
): ProtobufDescriptor {
  return root.toDescriptor("proto3");
}

/**
 * Convert a decoded descriptor set into a protobufjs Root.
 */
export function protobufFromDescriptor(
  descriptorSet: protobufjs.Message
): protobufjs.Root {
  return protobufjsRuntime.Root.fromDescriptor(descriptorSet);
}

/**
 * Decode binary FileDescriptorSet schema data into a protobufjs Root.
 */
export function protobufFromBinaryDescriptor(
  schemaData: Uint8Array
): protobufjs.Root {
  return protobufFromDescriptor(FileDescriptorSet.decode(schemaData));
}

function unwrapDefaultExport<T>(module: T | { default: T }): T {
  if (module && typeof module === "object" && "default" in module) {
    return (module as { default: T }).default;
  }

  return module as T;
}
