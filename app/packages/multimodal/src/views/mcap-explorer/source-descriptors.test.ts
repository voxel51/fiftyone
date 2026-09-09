import { describe, expect, it, vi } from "vitest";
import { registerMcapCloudSourceResolver } from "../../extensions/mcap-explorer";
import { BYTE_SOURCE_READ_PROFILE } from "../../query/bytes";
import {
  createLocalMcapSourceDescriptor,
  createRemoteMcapSourceDescriptor,
  isMcapFile,
  resolveRemoteMcapSourceDescriptor,
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

  it("rejects cloud paths when no resolver is registered", async () => {
    await expect(
      resolveRemoteMcapSourceDescriptor("s3://bucket/file.mcap"),
    ).rejects.toThrow("Only HTTP(S) MCAP URLs are supported");
  });

  it("resolves a cloud path without putting its signed URL in the source id", async () => {
    const resolver = vi.fn(
      async () => "https://signed.example.com/file.mcap?token=secret",
    );
    const unregister = registerMcapCloudSourceResolver(resolver);

    try {
      await expect(
        resolveRemoteMcapSourceDescriptor(" gs://bucket/runs/drive.mcap "),
      ).resolves.toEqual({
        fileName: "drive.mcap",
        source: {
          readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
          sourceId: "remote-url:gs://bucket/runs/drive.mcap",
          url: "https://signed.example.com/file.mcap?token=secret",
        },
      });
      expect(resolver).toHaveBeenCalledWith("gs://bucket/runs/drive.mcap");
    } finally {
      unregister();
    }
  });

  it("preserves dot segments that may be literal cloud object keys", async () => {
    const resolver = vi.fn(
      async () => "https://signed.example.com/file.mcap?token=secret",
    );
    const unregister = registerMcapCloudSourceResolver(resolver);

    try {
      const descriptor = await resolveRemoteMcapSourceDescriptor(
        " s3://bucket/runs/../drive.mcap ",
      );

      expect(resolver).toHaveBeenCalledWith("s3://bucket/runs/../drive.mcap");
      expect(descriptor.source.sourceId).toBe(
        "remote-url:s3://bucket/runs/../drive.mcap",
      );
    } finally {
      unregister();
    }
  });

  it("rejects a non-HTTP response from the cloud resolver", async () => {
    const unregister = registerMcapCloudSourceResolver(
      async () => "s3://bucket/still-raw.mcap",
    );

    try {
      await expect(
        resolveRemoteMcapSourceDescriptor("s3://bucket/file.mcap"),
      ).rejects.toThrow("server did not return a valid signed MCAP URL");
    } finally {
      unregister();
    }
  });
});
