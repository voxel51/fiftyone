import type { DescMessage, MessageShape } from "@bufbuild/protobuf";
import { fromBinary } from "@bufbuild/protobuf";
import { getFetchFunction } from "@fiftyone/utilities";

/**
 * Fetches a protobuf response through FiftyOne's configured app transport and
 * decodes it with the provided schema.
 */
export async function fetchProtobuf<Schema extends DescMessage>(
  path: string,
  schema: Schema
): Promise<MessageShape<Schema>> {
  const buffer = await getFetchFunction({ cache: true })<
    undefined,
    ArrayBuffer
  >("GET", path, undefined, "arrayBuffer");

  return fromBinary(schema, new Uint8Array(buffer));
}
