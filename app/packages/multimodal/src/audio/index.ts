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
