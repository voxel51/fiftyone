import { useEffect, useState, type RefObject } from "react";
import { audioMutedAtom, audioVolumeAtom } from "./atoms";
import { usePlaybackStore } from "./playback-store-context";
import { setAudioAvailable, setAudioMuted } from "./store-access";
import { detectElementHasAudio } from "./use-audio-stream";

/**
 * Audio for a timeline whose picture element is also the audio source —
 * a separate `<audio>` on the same URL would double-fetch and double-play.
 *
 * Applies `audioVolumeAtom` / `audioMutedAtom` to the element, detects
 * track presence, and publishes `audioAvailableAtom`. Only a conclusive
 * "no audio track" hides the volume UI. Transport and seeks stay with
 * `useVideoSync`; pair both on the same ref.
 */
export function useMediaElementAudio(
  mediaRef: RefObject<HTMLMediaElement | null>,
): void {
  const store = usePlaybackStore();
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);

  // Detection signals may only settle once decode starts — keep probing
  // until conclusive.
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

    // `audioTracks` is empty before media loads — probing early reads as
    // a false "no".
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

  const available = hasAudio !== false;
  useEffect(() => {
    if (!available) {
      return undefined;
    }
    setAudioAvailable(store, true);
    return () => setAudioAvailable(store, false);
  }, [available, store]);

  // Volume / mute follow the atoms.
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
      // an unmounted hook must not leave sound playing
      element.muted = true;
    };
  }, [mediaRef, store]);

  // Reflect a browser self-mute (rejected unmuted playback) back into the
  // atom so the UI shows reality.
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
