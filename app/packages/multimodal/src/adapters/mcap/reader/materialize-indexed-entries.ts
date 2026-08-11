import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapMessage,
} from "./types";

/** Materializes indexed entries while enforcing the reader's positional contract. */
export async function materializeIndexedEntries(
  reader: McapIndexedReaderLike,
  entries: readonly McapIndexedMessageTime[],
  signal?: AbortSignal,
): Promise<readonly McapMessage[]> {
  const readIndexedMessages = reader.readIndexedMessages?.bind(reader);
  if (!readIndexedMessages) {
    throw new Error("MCAP indexed message reads are unavailable");
  }

  void reader.prefetchChunkData?.({
    chunkStartOffsets: [
      ...new Set(entries.map((entry) => entry.chunkStartOffset)),
    ],
  });
  const messages = await readIndexedMessages({ entries, signal });
  if (messages.length !== entries.length) {
    throw new Error(
      `MCAP indexed message reader returned ${messages.length} messages for ${entries.length} entries`,
    );
  }
  messages.forEach((message, index) => {
    const entry = entries[index];
    if (
      !entry ||
      message.channelId !== entry.channelId ||
      message.logTime !== entry.logTimeNs
    ) {
      throw new Error("MCAP message index/data positional mismatch");
    }
  });
  return messages;
}
