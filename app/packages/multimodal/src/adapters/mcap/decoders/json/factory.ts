import type { DecodeContext, Decoder } from "../../../../decoders";
import type { DecodedOutput, PayloadDescriptor } from "../../../../ir";
import { timingFromContext } from "../foxglove/protobuf/timing";
import { decodeJsonRecord } from "./decode";

type JsonMapper = (
  record: Record<string, unknown>,
  context: DecodeContext,
) => DecodedOutput;

/**
 * Builds one JSON decoder per supported payload descriptor for a message family.
 */
export function jsonDecodersForPayloads({
  id,
  map,
  payloads,
}: {
  readonly id: string;
  readonly map: JsonMapper;
  readonly payloads: readonly PayloadDescriptor[];
}): readonly Decoder[] {
  return payloads.map((payload) => ({
    id: `${id}.${decoderIdSuffix(payload)}`,
    payload,
    version: "1",
    decode(bytes, context) {
      try {
        return map(decodeJsonRecord(bytes), context);
      } catch (error) {
        console.warn(`[${id}] JSON decode failed`, error);
        return degradedJsonOutput(context, error);
      }
    },
  }));
}

function decoderIdSuffix(payload: PayloadDescriptor): string {
  return [payload.schema, payload.schemaEncoding]
    .filter((value): value is string => Boolean(value))
    .join(".")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-");
}

function degradedJsonOutput(
  context: DecodeContext,
  error: unknown,
): DecodedOutput {
  return {
    attributes: {
      decodeError: error instanceof Error ? error.message : String(error),
    },
    timing: timingFromContext(context, undefined),
  };
}
