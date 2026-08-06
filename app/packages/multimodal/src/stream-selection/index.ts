const TOKEN_SPLIT_PATTERN = /[^a-z0-9]+/;

const PREFERENCE_MARKER_SCORES = new Map<string, number>([
  ["downsample", 2],
  ["downsampled", 2],
  ["downsamp", 2],
  ["lowres", 2],
  ["reduced", 2],
  ["resized", 2],
  ["compress", 1],
  ["compressed", 1],
  ["compressedimage", 1],
]);

const PREFERENCE_MARKER_TOKENS = new Set(PREFERENCE_MARKER_SCORES.keys());
const IGNORED_PAIRING_TOKENS = new Set([
  "annotation",
  "annotations",
  "cam",
  "camera",
  "image",
  "rect",
  ...PREFERENCE_MARKER_TOKENS,
]);
const IMAGE_SUFFIX_TOKENS = new Set([
  "image",
  "raw",
  "rect",
  ...PREFERENCE_MARKER_TOKENS,
]);

/** Supplies the semantic identity used to group equivalent stream choices. */
export interface DefaultStreamPreferenceOptions<T> {
  /** Equivalence is scoped by kind so unrelated stream families never merge. */
  readonly getKind?: (item: T) => string;
  readonly getSourceName: (item: T) => string;
}

interface DefaultStreamCandidate<T> {
  readonly item: T;
  readonly markerScore: number;
}

interface DefaultStreamGroup<T> {
  readonly candidates: DefaultStreamCandidate<T>[];
  readonly kind: string;
  readonly tokenKeys: string[][];
}

/** Chooses the annotation source name that best matches an image source name. */
export function chooseAnnotationStream(
  imageSourceName: string,
  annotationSourceNames: readonly string[],
): string | null {
  if (annotationSourceNames.length === 0) return null;

  const cameraPrefix = streamPrefix(imageSourceName);
  const exactStream = cameraPrefix ? `${cameraPrefix}/annotations` : "";
  const exact = annotationSourceNames.find(
    (sourceName) => sourceName === exactStream,
  );
  return (
    exact ??
    findBestMatchingAnnotationStreams(
      imageSourceName,
      annotationSourceNames,
    )[0] ??
    null
  );
}

/** Returns all annotation source names tied for the strongest positive match. */
export function findBestMatchingAnnotationStreams(
  imageSourceName: string,
  annotationSourceNames: readonly string[],
): readonly string[] {
  let bestScore = 0;
  let matches: string[] = [];
  const cameraPrefix = streamPrefix(imageSourceName);
  const imageTokens = streamTokens(imageSourceName);

  for (const annotationSourceName of annotationSourceNames) {
    const score = streamMatchScore(
      annotationSourceName,
      cameraPrefix,
      imageTokens,
    );
    if (score > bestScore) {
      bestScore = score;
      matches = [annotationSourceName];
    } else if (score > 0 && score === bestScore) {
      matches.push(annotationSourceName);
    }
  }
  return matches;
}

/** Chooses the unique calibration source name matching an image source name. */
export function chooseCalibrationStream(
  imageSourceName: string,
  calibrationSourceNames: readonly string[],
): string | null {
  if (calibrationSourceNames.length === 0) return null;

  const cameraPrefix = streamPrefix(imageSourceName);
  const exactStream = cameraPrefix ? `${cameraPrefix}/camera_info` : "";
  const exact = calibrationSourceNames.find(
    (sourceName) => sourceName === exactStream,
  );
  if (exact) return exact;

  let bestStream: string | null = null;
  let bestScore = 0;
  let bestScoreTied = false;
  const imageTokens = streamTokens(imageSourceName);
  for (const calibrationSourceName of calibrationSourceNames) {
    const score = streamMatchScore(
      calibrationSourceName,
      cameraPrefix,
      imageTokens,
    );
    if (score > bestScore) {
      bestScore = score;
      bestStream = calibrationSourceName;
      bestScoreTied = false;
    } else if (score > 0 && score === bestScore) {
      bestScoreTied = true;
    }
  }
  return bestScoreTied ? null : bestStream;
}

/** Keeps one preferred compressed/downsampled representative per group. */
export function filterDefaultStreamEquivalents<T>(
  items: readonly T[],
  options: DefaultStreamPreferenceOptions<T>,
): readonly T[] {
  const result: T[] = [];
  for (const group of defaultStreamGroups(items, options)) {
    const preferred = bestDefaultStreamCandidate(group);
    result.push(
      ...(preferred && group.candidates.length > 1
        ? [preferred.item]
        : group.candidates.map((candidate) => candidate.item)),
    );
  }
  return result;
}

/** Orders a preferred representative before its raw/base equivalents. */
export function orderDefaultStreamEquivalents<T>(
  items: readonly T[],
  options: DefaultStreamPreferenceOptions<T>,
): readonly T[] {
  const result: T[] = [];
  for (const group of defaultStreamGroups(items, options)) {
    const preferred = bestDefaultStreamCandidate(group);
    if (!preferred || group.candidates.length <= 1) {
      result.push(...group.candidates.map((candidate) => candidate.item));
      continue;
    }
    result.push(preferred.item);
    for (const candidate of group.candidates) {
      if (candidate !== preferred) result.push(candidate.item);
    }
  }
  return result;
}

/** Removes image-format suffix segments from a hierarchical stream name. */
export function streamPrefix(stream: string): string {
  const normalized = stream.replace(/\/+$/, "");
  const hasLeadingSlash = normalized.startsWith("/");
  const parts = normalized.split("/").filter(Boolean);
  while (parts.length > 0 && isImageSuffix(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.length > 0
    ? `${hasLeadingSlash ? "/" : ""}${parts.join("/")}`
    : "";
}

/** Normalized tokens used for fuzzy semantic stream pairing. */
export function streamTokens(stream: string): Set<string> {
  return new Set(
    splitTokens(stream).filter((token) => !IGNORED_PAIRING_TOKENS.has(token)),
  );
}

function streamMatchScore(
  annotationStream: string,
  cameraPrefix: string,
  imageTokens: ReadonlySet<string>,
): number {
  const annotationTokens = streamTokens(annotationStream);
  let score =
    cameraPrefix && isAtOrBelowPrefix(annotationStream, cameraPrefix) ? 10 : 0;
  for (const token of imageTokens) {
    if (annotationTokens.has(token)) score += 1;
  }
  return score;
}

function defaultStreamGroups<T>(
  items: readonly T[],
  { getKind, getSourceName }: DefaultStreamPreferenceOptions<T>,
): DefaultStreamGroup<T>[] {
  const groups: DefaultStreamGroup<T>[] = [];
  for (const item of items) {
    const sourceName = getSourceName(item);
    const kind = getKind?.(item) ?? "";
    const tokenKey = defaultStreamTokenKey(sourceName, kind);
    let group = groups.find(
      (candidate) =>
        candidate.kind === kind &&
        candidate.tokenKeys.some((key) => tokenKeysEqual(key, tokenKey)),
    );
    if (!group) {
      group = { candidates: [], kind, tokenKeys: [] };
      groups.push(group);
    }
    group.tokenKeys.push(tokenKey);
    group.candidates.push({
      item,
      markerScore: preferenceMarkerScore(sourceName),
    });
  }
  return groups;
}

function bestDefaultStreamCandidate<T>(
  group: DefaultStreamGroup<T>,
): DefaultStreamCandidate<T> | null {
  let best: DefaultStreamCandidate<T> | null = null;
  for (const candidate of group.candidates) {
    if (
      candidate.markerScore > 0 &&
      (!best || candidate.markerScore > best.markerScore)
    ) {
      best = candidate;
    }
  }
  return best;
}

function defaultStreamTokenKey(sourceName: string, kind: string): string[] {
  const basis =
    kind === "image" ? streamPrefix(sourceName) || sourceName : sourceName;
  const withoutMarkers = splitTokens(basis).filter(
    (token) => !PREFERENCE_MARKER_TOKENS.has(token),
  );
  return withoutMarkers.length > 0 ? withoutMarkers : splitTokens(sourceName);
}

function tokenKeysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length > 0 &&
    right.length > 0 &&
    left.length === right.length &&
    left.every((token, index) => token === right[index])
  );
}

function preferenceMarkerScore(sourceName: string): number {
  let score = 0;
  for (const token of splitTokens(sourceName)) {
    score = Math.max(score, PREFERENCE_MARKER_SCORES.get(token) ?? 0);
  }
  return score;
}

function isAtOrBelowPrefix(stream: string, prefix: string): boolean {
  return stream === prefix || stream.startsWith(`${prefix}/`);
}

function isImageSuffix(segment: string): boolean {
  const tokens = segment
    .toLowerCase()
    .split(TOKEN_SPLIT_PATTERN)
    .filter(Boolean);
  return (
    tokens.length > 0 && tokens.every((token) => IMAGE_SUFFIX_TOKENS.has(token))
  );
}

function splitTokens(stream: string): string[] {
  return stream.toLowerCase().split(TOKEN_SPLIT_PATTERN).filter(Boolean);
}
