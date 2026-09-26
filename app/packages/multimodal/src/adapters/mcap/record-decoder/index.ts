import type { EncodedMessageChannel, MessageValue } from "../../../ir";
import { genericRecordDecoderForChannel } from "../resource-client/generic-record-decoder";
import { messageValue } from "../resource-client/message-value";

/** Resolves the same full message values used by MCAP inspection and scripts. */
export function createMcapMessageDecoder(
  channel: EncodedMessageChannel,
): ((bytes: Uint8Array) => MessageValue) | null {
  const schemaId = 0;
  const schema =
    channel.schemaData === undefined
      ? undefined
      : {
          type: "Schema" as const,
          id: schemaId,
          name: channel.schemaName ?? "",
          encoding: channel.schemaEncoding ?? "",
          data: channel.schemaData,
        };
  const decode = genericRecordDecoderForChannel(
    { schemasById: new Map(schema ? [[schemaId, schema]] : []) },
    { schemaId, messageEncoding: channel.messageEncoding },
    { defaults: true },
  );
  return decode ? (bytes) => messageValue(decode(bytes)) : null;
}
