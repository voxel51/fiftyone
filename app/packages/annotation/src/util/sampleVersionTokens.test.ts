import { beforeEach, describe, expect, it } from "vitest";
import type { Sample } from "@fiftyone/looker";
import {
  clearSampleVersions,
  recordSampleVersion,
  resolveSampleVersionToken,
} from "./sampleVersionTokens";

const ID = "66e4b1c2f0a1b2c3d4e5f601";
const T0 = new Date("2026-09-14T22:19:00.000Z");
const T1 = new Date("2026-09-14T22:19:04.250Z");
const T2 = new Date("2026-09-14T22:19:09.500Z");

const appSample = (at: Date, id = ID) =>
  ({
    _id: id,
    last_modified_at: { datetime: at.getTime() },
  }) as unknown as Sample;

const serverBody = (at: Date, id = ID) => ({
  _id: id,
  last_modified_at: { $date: at.toISOString() },
});

describe("sample version record", () => {
  beforeEach(() => {
    clearSampleVersions();
  });

  it("derives the token from the app's sample when nothing is recorded", () => {
    expect(resolveSampleVersionToken({ sample: appSample(T0) })).toBe(
      "2026-09-14T22:19:00.000",
    );
  });

  it("returns null when neither the sample nor the record has a version", () => {
    expect(resolveSampleVersionToken({ sample: null })).toBeNull();
    expect(
      resolveSampleVersionToken({ sample: { _id: ID } as unknown as Sample }),
    ).toBeNull();
  });

  it("prefers the server's exact ETag once a newer version is recorded", () => {
    recordSampleVersion({ sample: serverBody(T1), versionToken: "etag-T1" });

    // the app's copy is still at T0: the closure never re-rendered
    expect(resolveSampleVersionToken({ sample: appSample(T0) })).toBe(
      "etag-T1",
    );
  });

  it("prefers the ETag over a derived token when the versions are equal", () => {
    recordSampleVersion({ sample: serverBody(T1), versionToken: "etag-T1" });

    expect(resolveSampleVersionToken({ sample: appSample(T1) })).toBe(
      "etag-T1",
    );
  });

  it("uses the app's copy when it is newer than the record (a write this tab never saw)", () => {
    recordSampleVersion({ sample: serverBody(T1), versionToken: "etag-T1" });

    expect(resolveSampleVersionToken({ sample: appSample(T2) })).toBe(
      "2026-09-14T22:19:09.500",
    );
  });

  it("never moves a record backwards", () => {
    recordSampleVersion({ sample: serverBody(T2), versionToken: "etag-T2" });
    recordSampleVersion({ sample: serverBody(T1), versionToken: "etag-T1" });

    expect(resolveSampleVersionToken({ sample: appSample(T0) })).toBe(
      "etag-T2",
    );
  });

  it("derives a token from the body when the response carried no ETag", () => {
    recordSampleVersion({ sample: serverBody(T1), versionToken: null });

    expect(resolveSampleVersionToken({ sample: appSample(T0) })).toBe(
      "2026-09-14T22:19:04.250",
    );
  });

  it("keeps records per sample id", () => {
    recordSampleVersion({
      sample: serverBody(T2, "other"),
      versionToken: "etag-other",
    });

    expect(resolveSampleVersionToken({ sample: appSample(T0) })).toBe(
      "2026-09-14T22:19:00.000",
    );
  });

  it("ignores bodies without an id or a parseable timestamp", () => {
    recordSampleVersion({ sample: null, versionToken: "x" });
    recordSampleVersion({ sample: { _id: ID }, versionToken: "x" });
    recordSampleVersion({
      sample: { last_modified_at: { $date: T1.toISOString() } },
      versionToken: "x",
    });

    expect(resolveSampleVersionToken({ sample: appSample(T0) })).toBe(
      "2026-09-14T22:19:00.000",
    );
  });
});
