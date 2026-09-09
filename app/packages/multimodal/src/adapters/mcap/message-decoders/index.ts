import type { Decoder } from "../../../decoders/index";
import { DecoderRegistry } from "../../../decoders/index";
import { foxgloveDecoders } from "./foxglove/index";
import { jsonDecoders } from "./json/index";
import { rosDecoders } from "./ros/index";

/**
 * Foxglove MCAP decoder exports provided by the MCAP adapter.
 */
export * from "./foxglove/index";

/**
 * JSON MCAP decoder exports provided by the MCAP adapter.
 */
export * from "./json/index";

/**
 * ROS MCAP decoder exports provided by the MCAP adapter.
 */
export * from "./ros/index";

/**
 * Built-in payload decoders used by the MCAP adapter.
 */
const mcapBuiltInDecoders: readonly Decoder[] = [
  ...foxgloveDecoders,
  ...jsonDecoders,
  ...rosDecoders,
];

/**
 * Creates an MCAP decoder registry with adapter-owned built-ins.
 *
 * Throws when an additional decoder collides with a built-in or earlier
 * additional decoder registration.
 */
export function createMcapDecoderRegistry(
  additionalDecoders: readonly Decoder[] = [],
): DecoderRegistry {
  const registry = new DecoderRegistry();

  for (const decoder of mcapBuiltInDecoders) {
    registry.register(decoder);
  }

  for (const decoder of additionalDecoders) {
    registry.register(decoder);
  }

  return registry;
}
