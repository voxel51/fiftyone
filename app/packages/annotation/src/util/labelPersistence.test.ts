import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/core/src/client", () => {
  class VersionMismatchError extends Error {
    constructor(
      message?: string,
      readonly responseBody?: Record<string, unknown>,
      readonly versionToken?: string,
    ) {
      super(message);
      this.name = "Version Mismatch Error";
    }
  }

  return {
    patchSample: vi.fn(),
    transformSampleData: (sample: Record<string, unknown>) => sample,
    VersionMismatchError,
  };
});

vi.mock("@fiftyone/looker/src/util", () => ({
  isSampleIsh: () => true,
}));

import { patchSample, VersionMismatchError } from "@fiftyone/core/src/client";
import type { Sample } from "@fiftyone/looker";
import { getSampleVersionToken } from "./getSampleVersionToken";
import { doPatchSample } from "./labelPersistence";

const LOADED = new Date("2026-09-09T14:16:24.457Z");
const WRITTEN = new Date("2026-09-09T14:16:32.520Z");

const serverSample = (id: string, lastModifiedAt: Date) => ({
  _id: id,
  _media_type: "image",
  filepath: "/tmp/image.png",
  last_modified_at: { datetime: lastModifiedAt.getTime() },
});

const makeArgs = (id: string) => {
  const sample = serverSample(id, LOADED) as unknown as Sample;

  return {
    sample,
    datasetId: "dataset-1",
    getVersionToken: () => getSampleVersionToken({ sample }),
    refreshSample: vi.fn(),
    sampleDeltas: [{ op: "replace", path: "/label", value: "cat" }] as never,
  };
};

describe("doPatchSample version token", () => {
  beforeEach(() => {
    vi.mocked(patchSample).mockReset();
  });

  it("sends the loaded token when nothing newer has been confirmed", async () => {
    const args = makeArgs("first-write");
    vi.mocked(patchSample).mockResolvedValue({
      sample: serverSample("first-write", WRITTEN) as unknown as Sample,
      versionToken: "etag",
    });

    await doPatchSample(args);

    expect(patchSample).toHaveBeenCalledWith(
      expect.objectContaining({ versionToken: "2026-09-09T14:16:24.457" }),
    );
  });

  it("records the written version so the next write does not reuse the loaded token", async () => {
    const args = makeArgs("second-write");
    vi.mocked(patchSample).mockResolvedValue({
      sample: serverSample("second-write", WRITTEN) as unknown as Sample,
      versionToken: "etag",
    });

    await doPatchSample(args);
    await doPatchSample(args);

    expect(vi.mocked(patchSample).mock.calls[1][0].versionToken).toBe(
      "2026-09-09T14:16:32.520",
    );
  });

  it("records the server's version from a 412 body", async () => {
    const args = makeArgs("mismatch");
    vi.mocked(patchSample).mockRejectedValueOnce(
      new VersionMismatchError(
        "Invalid version token",
        serverSample("mismatch", WRITTEN),
        "etag",
      ),
    );

    await expect(doPatchSample(args)).rejects.toBeInstanceOf(
      VersionMismatchError,
    );
    expect(args.refreshSample).toHaveBeenCalledOnce();
    expect(args.getVersionToken()).toBe("2026-09-09T14:16:32.520");
  });
});
