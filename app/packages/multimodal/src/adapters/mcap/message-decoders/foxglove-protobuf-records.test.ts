import { describe, expect, it } from "vitest";
import { optionalBigInt } from "./foxglove/protobuf/records";

describe("Foxglove protobuf record coercion", () => {
  it("treats invalid optional bigint protobuf fields as absent", () => {
    expect(optionalBigInt({ seconds: "not-a-number" }, "seconds")).toBe(
      undefined,
    );
    expect(
      optionalBigInt(
        { seconds: { toString: () => "also-not-a-number" } },
        "seconds",
      ),
    ).toBe(undefined);
  });
});
