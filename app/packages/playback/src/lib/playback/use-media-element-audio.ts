import { useEffect, useState, type RefObject } from "react";
import { audioMutedAtom, audioVolumeAtom } from "./atoms";
import { usePlaybackStore } from "./playback-store-context";
import { setAudioAvailable, setAudioMuted } from "./store-access";
import { detectElementHasAudio } from "./use-audio-stream";

/**
 * Audio for a timeline whose picture element IS the audio source — the
 * `html` decode strategy's `<video>`. Where `useAudioStream` owns a hidden
 * second element, here the sound must come out of the existing one:
 * a separate `<audio>` on the same URL would double-fetch and double-play.
 *
 * Responsibilities:
 * - `audioVolumeAtom` / `audioMutedAtom` → `volume` / `muted`. Transport
 *   and seeks are NOT handled here — `useVideoSync` owns those.
 * - Best-effort track detection (`detectElementHasAudio`), then publishes
 *   `audioAvailableAtom` for the volume UI. Only a conclusive "no audio
 *   track" hides the control: with no demuxer in this path, unknown must
 *   not lock the user out of unmuting a video that does have sound.
 * - An unmuted-autoplay rejection re-muted by `useAudioStream`'s guard has
 *   no equivalent here: the element plays via `useVideoSync`, whose play()
 *   failures already surface as a paused UI, not silent-but-"unmuted".
 *
 * Pair with `useVideoSync` on the same ref.
 */
export function useMediaElementAudio(
  mediaRef: RefObject<HTMLMediaElement | null>,
): void {
  const store = usePlaybackStore();
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);

  // Track detection: every signal is non-standard and some only settle
  // once decode starts, so keep probing until a conclusive answer.
  useEffect(() => {
    const element = mediaRef.current;
    if (!element) {
      return undefined;
    }

    const probe = () => {
      const detected = detectElementHasAudio(element);
      if (detected !== null) {
        setHasAudio(detected);
        element.removeEventListener("loadeddata", probe);
        element.removeEventListener("timeupdate", probe);
      }
    };

    // Never probe before the element has data: `audioTracks` exists but is
    // empty until the media loads, which would read as a conclusive "no".
    if (element.readyState >= element.HAVE_CURRENT_DATA) {
      probe();
    }
    element.addEventListener("loadeddata", probe);
    element.addEventListener("timeupdate", probe);
    return () => {
      element.removeEventListener("loadeddata", probe);
      element.removeEventListener("timeupdate", probe);
      setHasAudio(null);
    };
  }, [mediaRef]);

  // Availability for the volume UI. Cleared on teardown so a sample swap
  // can't leave a stale control behind.
  const available = hasAudio !== false;
  useEffect(() => {
    if (!available) {
      return undefined;
    }
    setAudioAvailable(store, true);
    return () => setAudioAvailable(store, false);
  }, [available, store]);

  // Volume / mute follow the atoms. A muted start is the atoms' default,
  // which doubles as the element's autoplay-safe initial state.
  useEffect(() => {
    const element = mediaRef.current;
    if (!element) {
      return undefined;
    }

    const apply = () => {
      element.volume = store.get(audioVolumeAtom);
      element.muted = store.get(audioMutedAtom);
    };
    apply();
    const unsubs = [
      store.sub(audioVolumeAtom, apply),
      store.sub(audioMutedAtom, apply),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
      // Leave the element as we found it — hard-muted — so a consumer
      // that unmounts the hook can't keep playing sound.
      element.muted = true;
    };
  }, [mediaRef, store]);

  // The element mutes itself when the browser rejects unmuted playback
  // (`volumechange` fires with `muted` back to true without our writing
  // it). Reflect that back into the atom so the UI shows reality.
  useEffect(() => {
    const element = mediaRef.current;
    if (!element) {
      return undefined;
    }

    const onVolumeChange = () => {
      if (element.muted && !store.get(audioMutedAtom)) {
        setAudioMuted(store, true);
      }
    };
    element.addEventListener("volumechange", onVolumeChange);
    return () => element.removeEventListener("volumechange", onVolumeChange);
  }, [mediaRef, store]);
}
