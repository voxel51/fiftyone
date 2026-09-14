import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSampleVersionToken } from "./getSampleVersionToken";
import type { Sample } from "@fiftyone/looker";

vi.mock("@fiftyone/core/src/client/util", () => ({
  parseTimestamp: vi.fn(),
}));

import { parseTimestamp } from "@fiftyone/core/src/client/util";

const generateTimestamp = () => ({
  datetime: new Date().getTime(),
});

describe("getSampleVersionToken", () => {
  let sample: Sample;

  beforeEach(() => {
    sample = {
      id: "some-id",
      last_modified_at: generateTimestamp(),
    } as Sample;
  });

  it("should return null when sample is null", () => {
    const result = getSampleVersionToken({ sample: null });
    expect(result).toBeNull();
  });

  it("should return null when sample.last_modified_at is undefined", () => {
    sample.last_modified_at = undefined;
    const result = getSampleVersionToken({ sample });
    expect(result).toBeNull();
  });

  it("should return null when sample.last_modified_at is null", () => {
    sample.last_modified_at = null;
    const result = getSampleVersionToken({ sample });
    expect(result).toBeNull();
  });

  it("should return null when parseTimestamp returns null", () => {
    vi.mocked(parseTimestamp).mockReturnValue(null);

    const result = getSampleVersionToken({ sample });
    expect(result).toBeNull();
  });

  it("should return null when parseTimestamp returns undefined", () => {
    vi.mocked(parseTimestamp).mockReturnValue(undefined);

    const result = getSampleVersionToken({ sample });
    expect(result).toBeNull();
  });

  it("should strip trailing Z from ISO timestamp", () => {
    const mockDate = new Date("2026-01-01T01:01:00Z");
    vi.mocked(parseTimestamp).mockReturnValue(mockDate);

    const result = getSampleVersionToken({ sample });
    expect(result).toBe("2026-01-01T01:01:00.000");
  });

  it("should return ISO timestamp as-is when it does not end with Z", () => {
    const mockDate = {
      toISOString: () => "2024-01-15T10:30:00.000+00:00",
    } as Date;
    vi.mocked(parseTimestamp).mockReturnValue(mockDate);

    const result = getSampleVersionToken({ sample });
    expect(result).toBe("2024-01-15T10:30:00.000+00:00");
  });
});
