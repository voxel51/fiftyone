import { getFetchFunctionExtended } from "@fiftyone/utilities";

const PLY_HEADER_RANGE_BYTES = 64 * 1024;
const MAX_PLY_HEADER_BYTES = 1024 * 1024;
const MAX_CACHED_PLY_CLASSIFICATIONS = 256;
const PLY_HEADER_DECODER = new TextDecoder("utf-8");
const PLY_SPLAT_DETECTION_CACHE = new Map<string, Promise<boolean>>();
const REQUIRED_GAUSSIAN_SPLAT_PLY_PROPERTIES = [
  "x",
  "y",
  "z",
  "scale_0",
  "scale_1",
  "scale_2",
  "rot_0",
  "rot_1",
  "rot_2",
  "rot_3",
] as const;
const REQUIRED_COMPRESSED_SPLAT_VERTEX_PROPERTIES = [
  "packed_position",
  "packed_rotation",
  "packed_scale",
  "packed_color",
] as const;
const REQUIRED_COMPRESSED_SPLAT_CHUNK_PROPERTIES = [
  "min_x",
  "min_y",
  "min_z",
  "max_x",
  "max_y",
  "max_z",
  "min_scale_x",
  "min_scale_y",
  "min_scale_z",
  "max_scale_x",
  "max_scale_y",
  "max_scale_z",
] as const;

const extractPlyHeaderFromText = (text: string) => {
  const match =
    /^ply(?:\r\n|\r|\n)(?:[^\r\n]*(?:\r\n|\r|\n))*?end_header[ \t]*(?:\r\n|\r|\n)/.exec(
      text,
    );

  return match?.[0] ?? null;
};

/** Extracts a complete PLY header from the provided leading file bytes. */
export const extractPlyHeaderText = (bytes: ArrayBuffer) => {
  return extractPlyHeaderFromText(PLY_HEADER_DECODER.decode(bytes));
};

const getPropertyNamesByElementFromPlyHeader = (headerText: string) => {
  const propertyNamesByElement = new Map<string, Set<string>>();
  let currentElement: string | null = null;

  for (const rawLine of headerText.split(/\r\n|\r|\n/)) {
    const lineValues = rawLine.trim().split(/\s+/);
    const lineType = lineValues.shift();

    if (lineType === "element") {
      currentElement = lineValues[0] ?? null;
      if (currentElement && !propertyNamesByElement.has(currentElement)) {
        propertyNamesByElement.set(currentElement, new Set());
      }
      continue;
    }

    if (
      !currentElement ||
      lineType !== "property" ||
      lineValues[0] === "list"
    ) {
      continue;
    }

    const propertyName = lineValues[1];
    if (propertyName) {
      propertyNamesByElement.get(currentElement)?.add(propertyName);
    }
  }

  return propertyNamesByElement;
};

/** Detects standard and compressed Gaussian splat layouts in a PLY header. */
export const inferPlyHeaderIsGaussianSplat = (
  headerText: string | null | undefined,
) => {
  if (!headerText) {
    return false;
  }

  const propertyNamesByElement =
    getPropertyNamesByElementFromPlyHeader(headerText);
  const vertexPropertyNames =
    propertyNamesByElement.get("vertex") ?? new Set<string>();
  const hasRequiredSplatProperties =
    REQUIRED_GAUSSIAN_SPLAT_PLY_PROPERTIES.every((propertyName) =>
      vertexPropertyNames.has(propertyName),
    );
  const chunkPropertyNames =
    propertyNamesByElement.get("chunk") ?? new Set<string>();
  const isCompressedSplat =
    REQUIRED_COMPRESSED_SPLAT_VERTEX_PROPERTIES.every((propertyName) =>
      vertexPropertyNames.has(propertyName),
    ) &&
    REQUIRED_COMPRESSED_SPLAT_CHUNK_PROPERTIES.every((propertyName) =>
      chunkPropertyNames.has(propertyName),
    );

  return hasRequiredSplatProperties || isCompressedSplat;
};

/** Reads through a PLY header and cancels the remaining response body. */
export const readPlyHeaderText = async (response: Response) => {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = await response.arrayBuffer();
    return extractPlyHeaderText(bytes.slice(0, MAX_PLY_HEADER_BYTES));
  }

  const decoder = new TextDecoder("utf-8");
  const cancelReader = () => reader.cancel().catch(() => undefined);
  let decodedText = "";
  let bytesRead = 0;

  while (bytesRead < MAX_PLY_HEADER_BYTES) {
    const { done, value } = await reader.read();
    if (done) {
      return extractPlyHeaderFromText(decodedText + decoder.decode());
    }

    const remainingBytes = MAX_PLY_HEADER_BYTES - bytesRead;
    const chunk = value.subarray(0, remainingBytes);
    bytesRead += chunk.byteLength;
    decodedText += decoder.decode(chunk, { stream: true });
    const headerText = extractPlyHeaderFromText(decodedText);
    if (headerText) {
      await cancelReader();
      return headerText;
    }
  }

  await cancelReader();
  return null;
};

const fetchPlyHeaderText = async (plyUrl: string) => {
  const fetchAsset = getFetchFunctionExtended();

  try {
    const { response } = await fetchAsset<null, Response>({
      method: "GET",
      path: plyUrl,
      result: "response",
      retries: 0,
      headers: { Range: `bytes=0-${PLY_HEADER_RANGE_BYTES - 1}` },
    });
    const rangedHeaderText = await readPlyHeaderText(response);

    if (rangedHeaderText || response.status !== 206) {
      return rangedHeaderText;
    }
  } catch {
    // Some file backends do not support Range. Fall through to a full fetch.
  }

  const { response } = await fetchAsset<null, Response>({
    method: "GET",
    path: plyUrl,
    result: "response",
    retries: 0,
  });

  return readPlyHeaderText(response);
};

const getAbortError = (signal: AbortSignal) => {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("PLY classification aborted", "AbortError");
};

const waitForDetection = (
  detection: Promise<boolean>,
  signal?: AbortSignal,
) => {
  if (!signal) {
    return detection;
  }

  if (signal.aborted) {
    return Promise.reject(getAbortError(signal));
  }

  return new Promise<boolean>((resolve, reject) => {
    const handleAbort = () => {
      reject(getAbortError(signal));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    detection.then(
      (result) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
};

/** Fetches enough of a PLY asset to determine whether Spark should load it. */
export const sniffPlyIsGaussianSplat = (
  plyUrl: string,
  signal?: AbortSignal,
) => {
  let detection = PLY_SPLAT_DETECTION_CACHE.get(plyUrl);

  if (!detection) {
    const nextDetection: Promise<boolean> = fetchPlyHeaderText(plyUrl)
      .then(inferPlyHeaderIsGaussianSplat)
      .catch((error) => {
        if (PLY_SPLAT_DETECTION_CACHE.get(plyUrl) === nextDetection) {
          PLY_SPLAT_DETECTION_CACHE.delete(plyUrl);
        }
        throw error;
      });
    detection = nextDetection;
    PLY_SPLAT_DETECTION_CACHE.set(plyUrl, nextDetection);

    if (PLY_SPLAT_DETECTION_CACHE.size > MAX_CACHED_PLY_CLASSIFICATIONS) {
      const oldestUrl = PLY_SPLAT_DETECTION_CACHE.keys().next().value;
      if (oldestUrl !== undefined) {
        PLY_SPLAT_DETECTION_CACHE.delete(oldestUrl);
      }
    }
  } else {
    // Refresh recency so large browsing sessions retain recently viewed PLYs.
    PLY_SPLAT_DETECTION_CACHE.delete(plyUrl);
    PLY_SPLAT_DETECTION_CACHE.set(plyUrl, detection);
  }

  // Classification is shared by every consumer of a URL. Aborting one caller
  // stops only that caller from waiting; it must not cancel another consumer's
  // in-flight classification.
  return waitForDetection(detection, signal);
};
