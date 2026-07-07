import type {
  DecodeContext,
  DecodedOutput,
  Decoder,
  PayloadDescriptor,
} from "../../../../decoders";
import { decodeRosMessage } from "./common";

type RosMapper = (
  record: Record<string, unknown>,
  context: DecodeContext,
) => DecodedOutput;

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
      return map(decodeRosMessage(bytes, payload, context), context);
    },
  }));
}
