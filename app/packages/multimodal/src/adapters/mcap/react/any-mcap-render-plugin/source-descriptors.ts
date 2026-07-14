import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../../../query/bytes";

export interface AnyMcapSourceDescriptor {
  readonly fileName: string;
  readonly source: ByteSourceDescriptor;
}

export function createLocalMcapSourceDescriptor(
  file: File,
): AnyMcapSourceDescriptor {
  if (!isMcapFile(file)) {
    throw new Error("Choose an .mcap file");
  }

  const sourceId = `local-file:${file.name}:${file.size}:${file.lastModified}`;
  return {
    fileName: file.name || "local.mcap",
    source: {
      localFile: file,
      readProfile: BYTE_SOURCE_READ_PROFILE.LOCAL,
      sizeBytes: String(file.size),
      sourceId,
      url: sourceId,
    },
  };
}

export function createRemoteMcapSourceDescriptor(
  value: string,
): AnyMcapSourceDescriptor {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter an HTTP(S) MCAP URL");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid HTTP(S) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) MCAP URLs are supported");
  }

  const href = url.toString();
  return {
    fileName: fileNameFromUrl(url) ?? "remote.mcap",
    source: {
      readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
      sourceId: `remote-url:${href}`,
      url: href,
    },
  };
}

export function isMcapFile(file: File): boolean {
  return /\.mcap$/i.test(file.name);
}

function fileNameFromUrl(url: URL): string | null {
  const pathname = decodeURIComponent(url.pathname);
  const finalSegment = pathname.split("/").filter(Boolean).pop();
  return finalSegment || null;
}
