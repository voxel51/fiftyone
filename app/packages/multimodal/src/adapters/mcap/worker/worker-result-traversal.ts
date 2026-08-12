import type { McapSynchronizedMessageWindow } from "../contracts";

/** Collects matching decoded messages from unary, array, and window results. */
export function messagesFromMcapWorkerResult<Message>(
  result: unknown,
  isMessage: (value: unknown) => value is Message,
): readonly Message[] {
  if (isMessage(result)) {
    return [result];
  }
  if (isMcapSynchronizedWindow(result)) {
    return (result.messages as readonly unknown[]).filter(isMessage);
  }
  if (Array.isArray(result)) {
    return result.flatMap((item) =>
      messagesFromMcapWorkerResult(item, isMessage),
    );
  }
  return [];
}

/** Recognizes the synchronized-window envelope used by worker results. */
export function isMcapSynchronizedWindow(
  value: unknown,
): value is McapSynchronizedMessageWindow {
  return Array.isArray(recordFromUnknown(value)?.messages);
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}
