/**
 * Container-neutral audio: decoded PCM in, mixable/drawable/audible audio
 * out. Adapters (MCAP today, plain audio files or another container
 * tomorrow) only implement an `AudioLoader`.
 */
export { useAudioPlayback } from "./use-audio-playback";
export type {
  AudioPlaybackStatus,
  UseAudioPlaybackOptions,
  UseAudioPlaybackResult,
} from "./use-audio-playback";
export { concatPcmChunks, pcmToFloat32 } from "./types";
export type {
  AudioLoadFailure,
  AudioLoadResult,
  AudioLoader,
  AudioMetadata,
  PcmAudioData,
} from "./types";
export {
  buildChannelPeakPyramids,
  buildPeakPyramid,
  channelLabel,
  chooseLod,
  synthesizePeaks,
  DEFAULT_SAMPLES_PER_PEAK,
} from "./peak-pyramid";
export type { PeakLevel, PeakPyramid } from "./peak-pyramid";
