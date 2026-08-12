import { BYTE_SOURCE_READ_PROFILE, type ByteSourceDescriptor } from "../../ir";
import { getMcapCloudSourceResolver } from "../../extensions/mcap-explorer";
import { sourceDisplayName } from "../episode";

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
  if (!value.trim()) {
    throw new Error("Enter an HTTP(S) MCAP URL");
  }

  const href = parseHttpUrl(
    value,
    "Enter a valid HTTP(S) URL",
    "Only HTTP(S) MCAP URLs are supported",
  );
  return createResolvedRemoteMcapSourceDescriptor(href, href);
}

/**
 * Resolves user input into a browser-readable MCAP source.
 *
 * HTTP(S) URLs pass through. Other ``scheme://`` paths require a
 * product-provided cloud resolver.
 */
export async function resolveRemoteMcapSourceDescriptor(
  value: string,
): Promise<AnyMcapSourceDescriptor> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter an HTTP(S) MCAP URL or cloud path");
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid HTTP(S) URL or cloud path");
  }

  if (sourceUrl.protocol === "http:" || sourceUrl.protocol === "https:") {
    return createRemoteMcapSourceDescriptor(sourceUrl.toString());
  }

  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    throw new Error("Enter a valid HTTP(S) URL or cloud path");
  }

  const resolveCloudSource = getMcapCloudSourceResolver();
  if (!resolveCloudSource) {
    throw new Error("Only HTTP(S) MCAP URLs are supported");
  }

  const cloudPath = trimmed;
  const signedUrl = await resolveCloudSource(cloudPath);
  const href = parseHttpUrl(
    signedUrl,
    "The server did not return a valid signed MCAP URL",
  );

  return createResolvedRemoteMcapSourceDescriptor(cloudPath, href);
}

function createResolvedRemoteMcapSourceDescriptor(
  sourceIdentity: string,
  href: string,
): AnyMcapSourceDescriptor {
  return {
    fileName: sourceDisplayName(sourceIdentity) ?? "remote.mcap",
    source: {
      readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
      sourceId: `remote-url:${sourceIdentity}`,
      url: href,
    },
  };
}

function parseHttpUrl(
  value: string,
  invalidMessage: string,
  unsupportedProtocolMessage = invalidMessage,
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(invalidMessage);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(unsupportedProtocolMessage);
  }

  return url.toString();
}

export function isMcapFile(file: File): boolean {
  return /\.mcap$/i.test(file.name);
}
