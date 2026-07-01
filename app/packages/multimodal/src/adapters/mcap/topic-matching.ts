// Drop generic topic words before scoring image/annotation topic similarity so
// camera-identifying tokens like "front" or "left" decide the best match.
const IGNORED_TOPIC_TOKENS = new Set([
  "annotation",
  "annotations",
  "cam",
  "camera",
  "compressed",
  "image",
  "rect",
]);

// Strip image-format suffix segments when deriving the camera topic prefix, so
// "/camera/front/image_rect_compressed" pairs with "/camera/front/annotations".
const IMAGE_TOPIC_SUFFIX_TOKENS = new Set([
  "compressed",
  "compressedimage",
  "image",
  "raw",
  "rect",
]);

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

  let bestTopic: string | null = null;
  let bestScore = 0;
  const imageTokens = topicTokens(imageTopic);

  for (const annotationTopic of annotationTopics) {
    const annotationTokens = topicTokens(annotationTopic);
    let score =
      cameraPrefix && isTopicAtOrBelowPrefix(annotationTopic, cameraPrefix)
        ? 10
        : 0;
    for (const token of imageTokens) {
      if (annotationTokens.has(token)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTopic = annotationTopic;
    }
  }

  return bestTopic;
}

/**
 * Chooses the camera-calibration topic that best matches a selected camera
 * topic. Prefers the exact `<camera prefix>/camera_info` sibling, then
 * falls back to the highest shared-token score.
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
    }
  }

  return bestTopic;
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
    topic
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token && !IGNORED_TOPIC_TOKENS.has(token)),
  );
}

function isTopicAtOrBelowPrefix(topic: string, prefix: string): boolean {
  return topic === prefix || topic.startsWith(`${prefix}/`);
}

function isImageTopicSuffix(segment: string): boolean {
  const tokens = segment
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return (
    tokens.length > 0 &&
    tokens.every((token) => IMAGE_TOPIC_SUFFIX_TOKENS.has(token))
  );
}
