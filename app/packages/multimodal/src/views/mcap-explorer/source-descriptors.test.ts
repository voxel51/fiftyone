import { describe, expect, it } from "vitest";
import { BYTE_SOURCE_READ_PROFILE } from "../../query/bytes";
import {
  createLocalMcapSourceDescriptor,
  createRemoteMcapSourceDescriptor,
  isMcapFile,
} from "./source-descriptors";

describe("any MCAP source descriptors", () => {
  it("accepts MCAP files and assigns a stable local source id", () => {
    const file = new File(["mcap"], "Drive.MCAP", {
      lastModified: 123,
      type: "application/octet-stream",
    });

    const descriptor = createLocalMcapSourceDescriptor(file);

    expect(descriptor).toEqual({
      fileName: "Drive.MCAP",
      source: {
        localFile: file,
        readProfile: BYTE_SOURCE_READ_PROFILE.LOCAL,
        sizeBytes: "4",
        sourceId: "local-file:Drive.MCAP:4:123",
        url: "local-file:Drive.MCAP:4:123",
      },
    });
    expect(isMcapFile(file)).toBe(true);
  });

  it("rejects non-MCAP local files", () => {
    expect(isMcapFile(new File(["nope"], "notes.txt"))).toBe(false);
    expect(() =>
      createLocalMcapSourceDescriptor(new File(["nope"], "notes.txt")),
    ).toThrow("Choose an .mcap file");
  });

  it("accepts HTTP(S) URLs and assigns the remote profile", () => {
    const descriptor = createRemoteMcapSourceDescriptor(
      " https://example.com/recordings/drive.mcap?signature=1 ",
    );

    expect(descriptor).toEqual({
      fileName: "drive.mcap",
      source: {
        readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
        sourceId:
          "remote-url:https://example.com/recordings/drive.mcap?signature=1",
        url: "https://example.com/recordings/drive.mcap?signature=1",
      },
    });
  });

  it("rejects non-HTTP(S) URLs", () => {
    expect(() =>
      createRemoteMcapSourceDescriptor("s3://bucket/file.mcap"),
    ).toThrow("Only HTTP(S) MCAP URLs are supported");
    expect(() => createRemoteMcapSourceDescriptor("not a url")).toThrow(
      "Enter a valid HTTP(S) URL",
    );
  });
});
