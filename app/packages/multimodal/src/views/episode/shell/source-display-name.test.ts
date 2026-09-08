import { describe, expect, it } from "vitest";
import { sourceDisplayName } from "./source-display-name";

describe("sourceDisplayName", () => {
  it("removes signed URL query parameters and decodes the filename", () => {
    expect(
      sourceDisplayName(
        "https://storage.example.com/runs/my%20drive.mcap?X-Amz-Signature=secret&token=secret",
      ),
    ).toBe("my drive.mcap");
  });

  it("uses the hostname when a remote URL has no filename", () => {
    expect(sourceDisplayName("https://storage.example.com/?token=secret")).toBe(
      "storage.example.com",
    );
  });

  it("extracts filenames from local POSIX and Windows paths", () => {
    expect(sourceDisplayName("/data/runs/drive.mcap")).toBe("drive.mcap");
    expect(sourceDisplayName("C:\\data\\runs\\drive.mcap")).toBe("drive.mcap");
  });

  it("returns null for missing sources", () => {
    expect(sourceDisplayName(null)).toBeNull();
    expect(sourceDisplayName("  ")).toBeNull();
  });
});
