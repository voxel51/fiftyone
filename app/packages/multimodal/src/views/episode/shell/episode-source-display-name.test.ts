import { describe, expect, it } from "vitest";
import { episodeSourceDisplayName } from "./episode-source-display-name";

describe("episodeSourceDisplayName", () => {
  it("removes signed URL query parameters and decodes the filename", () => {
    expect(
      episodeSourceDisplayName(
        "https://storage.example.com/runs/my%20drive.mcap?X-Amz-Signature=secret&token=secret",
      ),
    ).toBe("my drive.mcap");
  });

  it("uses the hostname when a remote URL has no filename", () => {
    expect(
      episodeSourceDisplayName("https://storage.example.com/?token=secret"),
    ).toBe("storage.example.com");
  });

  it("extracts filenames from local POSIX and Windows paths", () => {
    expect(episodeSourceDisplayName("/data/runs/drive.mcap")).toBe(
      "drive.mcap",
    );
    expect(episodeSourceDisplayName("C:\\data\\runs\\drive.mcap")).toBe(
      "drive.mcap",
    );
  });

  it("returns null for missing sources", () => {
    expect(episodeSourceDisplayName(null)).toBeNull();
    expect(episodeSourceDisplayName("  ")).toBeNull();
  });
});
