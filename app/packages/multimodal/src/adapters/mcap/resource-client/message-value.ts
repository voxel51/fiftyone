import type { MessageValue } from "../../../ir";

/** Normalize wire-library objects without losing 64-bit integers or bytes. */
export function messageValue(value: unknown): MessageValue {
  let remaining = 200_000;
  function visit(item: unknown, depth: number): MessageValue {
    if (--remaining < 0 || depth > 64) {
      throw new Error("Message exceeds the full-message value budget");
    }
    if (
      item === null ||
      item === undefined ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      typeof item === "bigint"
    )
      return item;
    if (ArrayBuffer.isView(item)) {
      // Buffer and typed arrays can originate in another JS realm.
      if (Object.prototype.toString.call(item) === "[object Uint8Array]") {
        return new Uint8Array(item.buffer, item.byteOffset, item.byteLength);
      }
      if ("length" in item) {
        return Array.from(item as unknown as ArrayLike<number | bigint>);
      }
      throw new Error("Unsupported message buffer");
    }
    if (Array.isArray(item))
      return item.map((child) => visit(child, depth + 1));
    if (typeof item !== "object") throw new Error("Unsupported message value");
    const record = item as Record<string, unknown>;
    // protobufjs represents int64/uint64 as Long instances, not JSON numbers.
    if (
      typeof record.toBigInt === "function" &&
      typeof record.low === "number" &&
      typeof record.high === "number" &&
      typeof record.unsigned === "boolean"
    ) {
      const bits =
        (BigInt(record.high >>> 0) << 32n) | BigInt(record.low >>> 0);
      return record.unsigned ? bits : BigInt.asIntN(64, bits);
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => [
        key,
        visit(child, depth + 1),
      ]),
    );
  }
  return visit(value, 0);
}
