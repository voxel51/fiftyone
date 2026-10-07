import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSampleVersionToken,
  recordSampleVersionToken,
} from "./getSampleVersionToken";
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
      getTime: () => 0,
      toISOString: () => "2024-01-15T10:30:00.000+00:00",
    } as Date;
    vi.mocked(parseTimestamp).mockReturnValue(mockDate);

    const result = getSampleVersionToken({ sample });
    expect(result).toBe("2024-01-15T10:30:00.000+00:00");
  });

  describe("with a server-confirmed version recorded", () => {
    const OLDER = new Date("2026-09-09T14:16:24.457Z");
    const NEWER = new Date("2026-09-09T14:16:32.520Z");

    beforeEach(() => {
      vi.mocked(parseTimestamp).mockImplementation((value) =>
        value && typeof value === "object" && "datetime" in value
          ? new Date(value.datetime)
          : null,
      );
    });

    it("prefers the recorded version when it is newer than the sample's", () => {
      const stale = {
        _id: "recorded-newer",
        last_modified_at: { datetime: OLDER.getTime() },
      } as Sample;
      recordSampleVersionToken({
        _id: "recorded-newer",
        last_modified_at: { datetime: NEWER.getTime() },
      });

      expect(getSampleVersionToken({ sample: stale })).toBe(
        "2026-09-09T14:16:32.520",
      );
    });

    it("keeps the sample's version when it is newer than the recorded one", () => {
      recordSampleVersionToken({
        _id: "sample-newer",
        last_modified_at: { datetime: OLDER.getTime() },
      });
      const fresh = {
        _id: "sample-newer",
        last_modified_at: { datetime: NEWER.getTime() },
      } as Sample;

      expect(getSampleVersionToken({ sample: fresh })).toBe(
        "2026-09-09T14:16:32.520",
      );
    });

    it("never regresses a recorded version to an older one", () => {
      recordSampleVersionToken({
        _id: "no-regress",
        last_modified_at: { datetime: NEWER.getTime() },
      });
      recordSampleVersionToken({
        _id: "no-regress",
        last_modified_at: { datetime: OLDER.getTime() },
      });
      const stale = {
        _id: "no-regress",
        last_modified_at: { datetime: OLDER.getTime() },
      } as Sample;

      expect(getSampleVersionToken({ sample: stale })).toBe(
        "2026-09-09T14:16:32.520",
      );
    });

    it("ignores records without a usable id or timestamp", () => {
      recordSampleVersionToken({ last_modified_at: { datetime: 1 } });
      recordSampleVersionToken({ _id: "no-timestamp" });
      recordSampleVersionToken(null);
      const fresh = {
        _id: "no-timestamp",
        last_modified_at: { datetime: NEWER.getTime() },
      } as Sample;

      expect(getSampleVersionToken({ sample: fresh })).toBe(
        "2026-09-09T14:16:32.520",
      );
    });
  });
});
