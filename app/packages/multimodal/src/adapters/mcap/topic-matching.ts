import {
  filterDefaultStreamEquivalents,
  orderDefaultStreamEquivalents,
} from "../../stream-matching";

/** @deprecated Import source-neutral stream matching from `../../stream-matching`. */
export {
  chooseAnnotationStream as chooseAnnotationTopic,
  chooseCalibrationStream as chooseCalibrationTopic,
  findBestMatchingAnnotationStreams as findBestMatchingAnnotationTopics,
  streamPrefix as topicPrefix,
  streamTokens as topicTokens,
} from "../../stream-matching";

/** @deprecated Compatibility shape for the MCAP adapter's topic vocabulary. */
export interface DefaultTopicPreferenceOptions<T> {
  readonly getKind?: (item: T) => string;
  readonly getTopic: (item: T) => string;
}

/** @deprecated Use `filterDefaultStreamEquivalents`. */
export function filterDefaultTopicEquivalents<T>(
  items: readonly T[],
  options: DefaultTopicPreferenceOptions<T>,
): readonly T[] {
  return filterDefaultStreamEquivalents(items, {
    getKind: options.getKind,
    getStream: options.getTopic,
  });
}

/** @deprecated Use `orderDefaultStreamEquivalents`. */
export function orderDefaultTopicEquivalents<T>(
  items: readonly T[],
  options: DefaultTopicPreferenceOptions<T>,
): readonly T[] {
  return orderDefaultStreamEquivalents(items, {
    getKind: options.getKind,
    getStream: options.getTopic,
  });
}
