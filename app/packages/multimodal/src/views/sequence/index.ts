/**
 * Playback for data with no recording of its own: an ordered list of
 * elements fetched page by page, presented on the episode playback shell.
 */
export {
  createIndexedSequenceSession,
  type IndexedSequencePage,
  type IndexedSequenceSessionOptions,
  type IndexedSequenceStream,
} from "../../adapters/sequence/indexed-sequence-session";
export {
  SourcePlayback,
  type SourcePlaybackProps,
} from "../episode/shell/SourcePlayback";
export {
  SCENE_SOURCE_TYPE,
  STREAM_KIND,
  VISUALIZATION_KIND,
  type DecodedOutput,
  type ImageAnnotationCircle,
  type ImageAnnotationPoints,
  type ImageAnnotationText,
  type ImageAnnotationsVisualization,
  type RgbaColor,
} from "../../ir";
