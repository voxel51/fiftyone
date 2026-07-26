import { describe, expect, it } from "vitest";
import { mcapSourceDisplayName } from "./mcap-source-display-name";

describe("mcapSourceDisplayName", () => {
  it("removes signed URL query parameters and decodes the filename", () => {
    expect(
      mcapSourceDisplayName(
        "https://storage.example.com/runs/my%20drive.mcap?X-Amz-Signature=secret&token=secret",
      ),
    ).toBe("my drive.mcap");
  });

  it("uses the hostname when a remote URL has no filename", () => {
    expect(
      mcapSourceDisplayName("https://storage.example.com/?token=secret"),
    ).toBe("storage.example.com");
  });

  it("extracts filenames from local POSIX and Windows paths", () => {
    expect(mcapSourceDisplayName("/data/runs/drive.mcap")).toBe("drive.mcap");
    expect(mcapSourceDisplayName("C:\\data\\runs\\drive.mcap")).toBe(
      "drive.mcap",
    );
  });

  it("returns null for missing sources", () => {
    expect(mcapSourceDisplayName(null)).toBeNull();
    expect(mcapSourceDisplayName("  ")).toBeNull();
  });
});
