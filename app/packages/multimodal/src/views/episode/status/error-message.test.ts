import { describe, expect, it } from "vitest";

import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("explains when the recording request returns HTTP 404", () => {
    const error = Object.assign(new Error(""), { code: 404 });

    expect(errorMessage(error)).toBe(
      "Recording not found (HTTP 404). Check that the file still exists at its configured path and is accessible to FiftyOne.",
    );
  });
});
