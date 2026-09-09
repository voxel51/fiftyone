import { describe, expect, it } from "vitest";

import { messagesFromMcapWorkerResult } from "./worker-result-traversal";

describe("MCAP worker result traversal", () => {
  it("applies the caller predicate across nested result arrays and windows", () => {
    const decoded = { decoded: { output: {} }, topic: "/camera" };
    const retained = {
      kind: "retained-decoded-message",
      topic: "/camera",
    };
    const isDecoded = (
      value: unknown,
    ): value is { readonly decoded: object; readonly topic: string } => {
      const record = value as Record<string, unknown> | null;
      return (
        !!record &&
        typeof record.topic === "string" &&
        typeof record.decoded === "object" &&
        record.decoded !== null
      );
    };

    expect(
      messagesFromMcapWorkerResult(
        [[{ messages: [retained, decoded] }], decoded],
        isDecoded,
      ),
    ).toEqual([decoded, decoded]);
  });
});
