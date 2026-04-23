import { EMBEDDED_DOCUMENT_FIELD } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { format } from "./PathValueEntry";

describe("format", () => {
  it("returns null for missing embedded documents", () => {
    expect(() =>
      format({
        ftype: EMBEDDED_DOCUMENT_FIELD,
        timeZone: "UTC",
        value: null,
      })
    ).not.toThrow();

    expect(
      format({
        ftype: EMBEDDED_DOCUMENT_FIELD,
        timeZone: "UTC",
        value: null,
      })
    ).toBeNull();
  });
});
