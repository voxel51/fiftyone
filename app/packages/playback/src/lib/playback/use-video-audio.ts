import { useEffect, useState, type RefObject } from "react";
import {
  audioMasterMutedAtom,
  audioMasterVolumeAtom,
  audioTrackMutedAtom,
  audioTrackVolumeAtom,
  isPlayingAtom,
} from "./atoms";
import { usePlaybackStore } from "./playback-store-context";
import {
  getEffectiveTrackMuted,
  getTrackVolumeMagnitude,
  isMasterMuteAtSessionDefault,
  registerAudioTrack,
  setSourceAudioAvailable,
  setMasterMuted,
} from "./store-access";
import { detectElementHasAudio } from "./use-audio-stream";

/**
 * Makes a `<video>` element the timeline's audio source: the element plays
 * its own muxed sound, and the timeline's volume / mute controls drive it.
 *
 * Use this instead of {@link useAudioStream} wherever the surface already
 * mounts a `<video>` for the picture. A second `HTMLAudioElement` over the
 * same URL would download and decode the whole file twice — the `<video>`
 * has the audio already, and taking it from there is the difference between
 * one media pipeline and two.
 *
 * ## What this hook does NOT do
 *
 * Almost everything {@link useAudioStream} needs, because the element is
 * already the picture:
 *
 * - No `PlaybackStream` registration — `useVideoStream` registered this
 *   element as the timeline's picture stream, and one element cannot buffer
 *   its picture and its sound to different points.
 * - No barrier gating for sound — same reason. Audio that comes out of the
 *   same decoder as the frames is buffered exactly when they are.
 * - No transport (`play` / `pause`), no seeking and no drift-chase —
 *   `useVideoSync` owns the element's transport and `currentTime`, and with
 *   `useVfcClockSource` the element IS the clock. There is nothing to chase.
 *
 * What is left is the mixer: the roster entry the volume UI reads, the
 * availability flag, and the element writes for volume, mute and rate.
 *
 * ## The muted attribute
 *
 * Do NOT put `muted` on the element. This hook writes `.muted` from the
 * effective mute state on mount, and `audioMasterMutedAtom` starts a session
 * muted precisely so that first write satisfies the autoplay policy. A
 * hardcoded `muted` would silence the surface permanently; nothing else can
 * override an attribute the component keeps re-asserting on every render.
 *
 * @param id Track id — MUST be the same id the element registers as a
 *   `PlaybackStream` with {@link useVideoStream} (see `AudioTrackDescriptor`).
 * @param videoRef The `<video>` element.
 * @param options.enabled Whether to bind at all; `false` leaves the element
 *   untouched and the timeline silent.
 * @param options.label Roster label; defaults to `id`.
 * @param options.hasAudio Demuxer-level verdict when the caller has one.
 *   `false` keeps the volume control hidden without waiting on the
 *   element's own (non-standard, often inconclusive) sniffing.
 * @returns The best-effort `hasAudio` signal; `null` means unknown.
 */
export function useVideoElementAudio(
  id: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  options: {
    enabled?: boolean;
    label?: string;
    hasAudio?: boolean;
  } = {},
): { hasAudio: boolean | null } {
  const enabled = options.enabled ?? true;
  const label = options.label ?? id;
  const store = usePlaybackStore();

  const [metadataReady, setMetadataReady] = useState(false);
  const [detected, setDetected] = useState<boolean | null>(null);

  // Metadata readiness + audio-track sniffing, off the element's own events.
  // The sniff is best-effort by nature (every signal it reads is
  // non-standard), so a caller with a demuxer verdict should pass
  // `options.hasAudio` and this stays a fallback.
  useEffect(() => {
    const element = videoRef.current;
    if (!enabled || !element) {
      return undefined;
    }

    const onLoadedMetadata = () => setMetadataReady(true);
    // A source swap (the element is reused across samples) invalidates both
    // answers: the new file's metadata hasn't loaded and the previous file's
    // audio verdict says nothing about it. `loadstart` is the element's own
    // ordering guarantee that it precedes the matching `loadedmetadata`.
    const onLoadStart = () => {
      setMetadataReady(false);
      setDetected(null);
    };
    const probe = () => {
      const verdict = detectElementHasAudio(element);
      if (verdict !== null) {
        setDetected(verdict);
      }
    };

    // The element may already be past these by the time this effect runs
    // (a cached source loads fast, and React commits effects after paint).
    if (element.readyState >= element.HAVE_METADATA) {
      setMetadataReady(true);
    }
    probe();

    element.addEventListener("loadstart", onLoadStart);
    element.addEventListener("loadedmetadata", onLoadedMetadata);
    element.addEventListener("loadeddata", probe);
    // `webkitAudioDecodedByteCount` stays 0 until decode starts, so keep
    // probing on timeupdate until a conclusive answer arrives.
    element.addEventListener("timeupdate", probe);

    return () => {
      element.removeEventListener("loadstart", onLoadStart);
      element.removeEventListener("loadedmetadata", onLoadedMetadata);
      element.removeEventListener("loadeddata", probe);
      element.removeEventListener("timeupdate", probe);
      setMetadataReady(false);
      setDetected(null);
    };
  }, [enabled, videoRef]);

  const hasAudio = options.hasAudio ?? detected;

  // Availability for the volume UI: a playable element exists and there is
  // no conclusive "no audio track" verdict.
  const available = enabled && metadataReady && hasAudio !== false;

  useEffect(() => {
    if (!available) {
      return undefined;
    }
    // Per-source, so a swap here cannot hide another source's controls —
    // see `setSourceAudioAvailable`.
    setSourceAudioAvailable(store, id, "available");
    return () => setSourceAudioAvailable(store, id, null);
  }, [available, store, id]);

  // Roster entry, so the Mixed dropdown / tile mute button can see and
  // control this source like any other audio track.
  useEffect(() => {
    if (!available) {
      return undefined;
    }
    return registerAudioTrack(store, { id, label, kind: "native-element" });
  }, [available, store, id, label]);

  // Volume and mute — applied straight to the element. `.volume` carries
  // the raw level (unmuted magnitude) so unmuting via `.muted` is instant;
  // mute state is `.muted`'s job alone. `playbackRate` belongs to the
  // element's transport and is applied by `useVideoSync`; pitch-preservation
  // across a rate change is an audio concern, so it is set here.
  useEffect(() => {
    const element = videoRef.current;
    if (!enabled || !element) {
      return undefined;
    }

    element.preservesPitch = true;

    const apply = () => {
      element.volume = getTrackVolumeMagnitude(store, id);
      element.muted = getEffectiveTrackMuted(store, id);
    };

    apply();
    const unsubs = [
      store.sub(audioTrackVolumeAtom(id), apply),
      store.sub(audioTrackMutedAtom(id), apply),
      store.sub(audioMasterVolumeAtom, apply),
      store.sub(audioMasterMutedAtom, apply),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [enabled, videoRef, store, id]);

  // Unmute on the first explicit play. The master mute starts a session
  // muted only to satisfy the autoplay policy, and pressing play is the
  // gesture that policy is waiting for — so a viewer who has expressed no
  // preference gets sound, while a deliberate mute is never overridden
  // (`isMasterMuteAtSessionDefault` distinguishes the two).
  //
  // Gated on `available`, not just `enabled`: master mute is global, so
  // playing a source with no audio track must not spend the one automatic
  // unmute this session gets. Otherwise the next sample that does have
  // sound starts at full volume with no unmute ever performed on a source
  // that could be heard.
  useEffect(() => {
    if (!available) {
      return undefined;
    }

    const unmuteIfUntouched = () => {
      if (store.get(isPlayingAtom) && isMasterMuteAtSessionDefault()) {
        setMasterMuted(store, false);
      }
    };

    // Read the CURRENT value as well as subscribing, because `available`
    // gates this effect on `loadedmetadata` — which can land after the
    // viewer has already pressed play. `store.sub` only fires on changes,
    // and `isPlayingAtom` does not change again, so subscribing alone misses
    // that transition and the surface stays silent for the whole session
    // with no second chance.
    unmuteIfUntouched();
    return store.sub(isPlayingAtom, unmuteIfUntouched);
  }, [available, store]);

  return { hasAudio };
}
