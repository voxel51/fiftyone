import type { Decoder } from "../../../decoders";
import { DecoderRegistry } from "../../../decoders";
import { foxgloveDecoders } from "./foxglove";

/**
 * Foxglove MCAP decoder exports provided by the MCAP adapter.
 */
export * from "./foxglove";

/**
 * Built-in payload decoders used by the MCAP adapter.
 */
const mcapBuiltInDecoders: readonly Decoder[] = [...foxgloveDecoders];

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
