const TOPIC_TOKEN_SPLIT_PATTERN = /[^a-z0-9]+/;

const DEFAULT_TOPIC_PREFERENCE_MARKER_SCORES = new Map<string, number>([
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

const DEFAULT_TOPIC_PREFERENCE_MARKER_TOKENS = new Set(
  DEFAULT_TOPIC_PREFERENCE_MARKER_SCORES.keys(),
);

// Drop generic topic words before scoring image/annotation topic similarity so
// camera-identifying tokens like "front" or "left" decide the best match.
const IGNORED_TOPIC_TOKENS = new Set([
  "annotation",
  "annotations",
  "cam",
  "camera",
  "image",
  "rect",
  ...DEFAULT_TOPIC_PREFERENCE_MARKER_TOKENS,
]);

// Strip image-format suffix segments when deriving the camera topic prefix, so
// "/camera/front/image_rect_compressed" pairs with "/camera/front/annotations".
const IMAGE_TOPIC_SUFFIX_TOKENS = new Set([
  "image",
  "raw",
  "rect",
  ...DEFAULT_TOPIC_PREFERENCE_MARKER_TOKENS,
]);

export interface DefaultTopicPreferenceOptions<T> {
  /**
   * Topic/source kind. Equivalence is scoped by kind so an image topic never
   * suppresses a point cloud just because their paths share sensor tokens.
   */
  readonly getKind?: (item: T) => string;
  readonly getTopic: (item: T) => string;
}

interface DefaultTopicCandidate<T> {
  readonly item: T;
  readonly markerScore: number;
  readonly topic: string;
}

interface DefaultTopicGroup<T> {
  readonly candidates: DefaultTopicCandidate<T>[];
  readonly kind: string;
  readonly tokenKeys: string[][];
}

/**
 * Chooses the annotation topic that best matches a selected camera topic.
 * Prefers the exact `<camera prefix>/annotations` sibling, then falls back
 * to the highest shared-token score.
 */
export function chooseAnnotationTopic(
  imageTopic: string,
  annotationTopics: readonly string[],
): string | null {
  if (annotationTopics.length === 0) {
    return null;
  }

  const cameraPrefix = topicPrefix(imageTopic);
  const exactTopic = cameraPrefix ? `${cameraPrefix}/annotations` : "";
  const exact = annotationTopics.find((topic) => topic === exactTopic);
  if (exact) {
    return exact;
  }

  return (
    findBestMatchingAnnotationTopics(imageTopic, annotationTopics)[0] ?? null
  );
}

/**
 * Returns every annotation topic tied for the strongest positive camera
 * match, preserving inventory order.
 */
export function findBestMatchingAnnotationTopics(
  imageTopic: string,
  annotationTopics: readonly string[],
): readonly string[] {
  let bestScore = 0;
  let matches: string[] = [];
  const cameraPrefix = topicPrefix(imageTopic);
  const imageTokens = topicTokens(imageTopic);

  for (const annotationTopic of annotationTopics) {
    const score = annotationTopicMatchScore(
      annotationTopic,
      cameraPrefix,
      imageTokens,
    );
    if (score > bestScore) {
      bestScore = score;
      matches = [annotationTopic];
    } else if (score > 0 && score === bestScore) {
      matches.push(annotationTopic);
    }
  }

  return matches;
}

function annotationTopicMatchScore(
  annotationTopic: string,
  cameraPrefix: string,
  imageTokens: ReadonlySet<string>,
): number {
  const annotationTokens = topicTokens(annotationTopic);
  let score =
    cameraPrefix && isTopicAtOrBelowPrefix(annotationTopic, cameraPrefix)
      ? 10
      : 0;
  for (const token of imageTokens) {
    if (annotationTokens.has(token)) score += 1;
  }
  return score;
}

/**
 * Chooses the camera-calibration topic that best matches a selected camera
 * topic. Prefers the exact `<camera prefix>/camera_info` sibling, then
 * falls back to a unique highest shared-token score.
 */
export function chooseCalibrationTopic(
  imageTopic: string,
  calibrationTopics: readonly string[],
): string | null {
  if (calibrationTopics.length === 0) {
    return null;
  }

  const cameraPrefix = topicPrefix(imageTopic);
  const exactTopic = cameraPrefix ? `${cameraPrefix}/camera_info` : "";
  const exact = calibrationTopics.find((topic) => topic === exactTopic);
  if (exact) {
    return exact;
  }

  let bestTopic: string | null = null;
  let bestScore = 0;
  let bestScoreTied = false;
  const imageTokens = topicTokens(imageTopic);

  for (const calibrationTopic of calibrationTopics) {
    const calibrationTokens = topicTokens(calibrationTopic);
    let score =
      cameraPrefix && isTopicAtOrBelowPrefix(calibrationTopic, cameraPrefix)
        ? 10
        : 0;
    for (const token of imageTokens) {
      if (calibrationTokens.has(token)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTopic = calibrationTopic;
      bestScoreTied = false;
    } else if (score > 0 && score === bestScore) {
      bestScoreTied = true;
    }
  }

  return bestScoreTied ? null : bestTopic;
}

/**
 * Removes raw/base topic equivalents from default activation when a sibling
 * with downsampled/compressed markers is available. The input order decides
 * ordinary ranking; within one equivalence group, the strongest marked topic
 * is kept as the default representative.
 */
export function filterDefaultTopicEquivalents<T>(
  items: readonly T[],
  options: DefaultTopicPreferenceOptions<T>,
): readonly T[] {
  const result: T[] = [];
  for (const group of defaultTopicGroups(items, options)) {
    const preferred = bestDefaultTopicCandidate(group);
    if (preferred && group.candidates.length > 1) {
      result.push(preferred.item);
    } else {
      result.push(...group.candidates.map((candidate) => candidate.item));
    }
  }
  return result;
}

/**
 * Keeps every item available for manual selection, but moves the default
 * representative of each equivalence group ahead of its raw/base siblings.
 */
export function orderDefaultTopicEquivalents<T>(
  items: readonly T[],
  options: DefaultTopicPreferenceOptions<T>,
): readonly T[] {
  const result: T[] = [];
  for (const group of defaultTopicGroups(items, options)) {
    const preferred = bestDefaultTopicCandidate(group);
    if (!preferred || group.candidates.length <= 1) {
      result.push(...group.candidates.map((candidate) => candidate.item));
      continue;
    }

    result.push(preferred.item);
    for (const candidate of group.candidates) {
      if (candidate !== preferred) {
        result.push(candidate.item);
      }
    }
  }
  return result;
}

/**
 * Returns the camera-like topic prefix after removing image suffix segments.
 */
export function topicPrefix(topic: string): string {
  const normalized = topic.replace(/\/+$/, "");
  const hasLeadingSlash = normalized.startsWith("/");
  const parts = normalized.split("/").filter(Boolean);

  while (parts.length > 0 && isImageTopicSuffix(parts[parts.length - 1])) {
    parts.pop();
  }

  return parts.length > 0
    ? `${hasLeadingSlash ? "/" : ""}${parts.join("/")}`
    : "";
}

/**
 * Returns normalized topic tokens used for fuzzy stream pairing.
 */
export function topicTokens(topic: string): Set<string> {
  return new Set(
    splitTopicTokens(topic).filter((token) => !IGNORED_TOPIC_TOKENS.has(token)),
  );
}

function defaultTopicGroups<T>(
  items: readonly T[],
  { getKind, getTopic }: DefaultTopicPreferenceOptions<T>,
): DefaultTopicGroup<T>[] {
  const groups: DefaultTopicGroup<T>[] = [];
  for (const item of items) {
    const topic = getTopic(item);
    const kind = getKind?.(item) ?? "";
    const tokenKey = defaultTopicTokenKey(topic, kind);
    let group = groups.find(
      (candidate) =>
        candidate.kind === kind &&
        candidate.tokenKeys.some((existingKey) =>
          defaultTopicTokenKeysMatch(existingKey, tokenKey),
        ),
    );
    if (!group) {
      group = { candidates: [], kind, tokenKeys: [] };
      groups.push(group);
    }

    group.tokenKeys.push(tokenKey);
    group.candidates.push({
      item,
      markerScore: defaultTopicPreferenceMarkerScore(topic),
      topic,
    });
  }
  return groups;
}

function bestDefaultTopicCandidate<T>(
  group: DefaultTopicGroup<T>,
): DefaultTopicCandidate<T> | null {
  let best: DefaultTopicCandidate<T> | null = null;
  for (const candidate of group.candidates) {
    if (candidate.markerScore <= 0) {
      continue;
    }
    if (!best || candidate.markerScore > best.markerScore) {
      best = candidate;
    }
  }
  return best;
}

function defaultTopicTokenKey(topic: string, kind: string): string[] {
  const basis = kind === "image" ? topicPrefix(topic) || topic : topic;
  const withoutMarkers = splitTopicTokens(basis).filter(
    (token) => !DEFAULT_TOPIC_PREFERENCE_MARKER_TOKENS.has(token),
  );
  return withoutMarkers.length > 0 ? withoutMarkers : splitTopicTokens(topic);
}

function defaultTopicTokenKeysMatch(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length === 0 || right.length === 0) {
    return false;
  }
  return topicTokenKeysEqual(left, right);
}

function topicTokenKeysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && left.every((token, i) => token === right[i])
  );
}

function defaultTopicPreferenceMarkerScore(topic: string): number {
  let score = 0;
  for (const token of splitTopicTokens(topic)) {
    score = Math.max(
      score,
      DEFAULT_TOPIC_PREFERENCE_MARKER_SCORES.get(token) ?? 0,
    );
  }
  return score;
}

function isTopicAtOrBelowPrefix(topic: string, prefix: string): boolean {
  return topic === prefix || topic.startsWith(`${prefix}/`);
}

function isImageTopicSuffix(segment: string): boolean {
  const tokens = segment
    .toLowerCase()
    .split(TOPIC_TOKEN_SPLIT_PATTERN)
    .filter(Boolean);

  return (
    tokens.length > 0 &&
    tokens.every((token) => IMAGE_TOPIC_SUFFIX_TOKENS.has(token))
  );
}

function splitTopicTokens(topic: string): string[] {
  return topic.toLowerCase().split(TOPIC_TOKEN_SPLIT_PATTERN).filter(Boolean);
}
