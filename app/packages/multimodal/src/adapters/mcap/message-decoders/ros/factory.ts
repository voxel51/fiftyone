import type { DecodeContext, Decoder } from "../../../../decoders/index";
import type { DecodedOutput, PayloadDescriptor } from "../../../../ir/index";
import { decodeRosMessage } from "./common";

type RosMapper = (
  record: Record<string, unknown>,
  context: DecodeContext,
  bytes: Uint8Array,
) => DecodedOutput;

/**
 * Builds one ROS decoder per supported payload descriptor for a message family.
 */
export function rosDecodersForPayloads({
  id,
  map,
  payloads,
}: {
  readonly id: string;
  readonly map: RosMapper;
  readonly payloads: readonly PayloadDescriptor[];
}): readonly Decoder[] {
  return payloads.map((payload) => ({
    id: `${id}.${payload.schemaEncoding}`,
    payload,
    version: "1",
    decode(bytes, context) {
      return map(decodeRosMessage(bytes, payload, context), context, bytes);
    },
  }));
}
