import { useFrame } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnimationClip, AnimationMixer } from "three";
import { PANEL_ORDER_ANIMATIONS } from "../constants";

export const useAnimationSelect = (
  assetLabel: string,
  animationClips: AnimationClip[],
  mixer: AnimationMixer | null
) => {
  const availableAnimationClips = useMemo(
    () => animationClips.filter(Boolean),
    [animationClips]
  );

  const [currentAnimationIndex, setCurrentAnimationIndex] = useState(
    availableAnimationClips.length > 0 ? 0 : null
  );

  useEffect(() => {
    if (!availableAnimationClips.length) {
      setCurrentAnimationIndex(null);
      return;
    }

    setCurrentAnimationIndex((currentValue) => {
      if (
        currentValue === null ||
        currentValue < 0 ||
        currentValue >= availableAnimationClips.length
      ) {
        return 0;
      }

      return currentValue;
    });
  }, [availableAnimationClips]);

  // This effect sets animation to the first clip when the mixer first appears.
  const prevMixerRef = useRef<AnimationMixer | null>(null);
  useEffect(() => {
    const mixerWasNull = prevMixerRef.current === null;
    prevMixerRef.current = mixer;

    if (!mixer || !availableAnimationClips.length || !mixerWasNull) {
      return;
    }

    setCurrentAnimationIndex(0);
  }, [mixer, availableAnimationClips.length]);

  // This effect plays the selected clip and stops actions on cleanup.
  useEffect(() => {
    if (!mixer || currentAnimationIndex === null) {
      return;
    }

    const clip = availableAnimationClips[currentAnimationIndex];

    if (!clip) {
      return;
    }

    const action = mixer.clipAction(clip);

    if (action) {
      action.play();
    }

    return () => {
      mixer.stopAllAction();
    };
  }, [availableAnimationClips, currentAnimationIndex, mixer]);

  useFrame((_state, delta) => {
    mixer?.update(delta);
  });

  const animationNameEntries = useMemo(() => {
    const entries: Record<string, number | null> = {};
    const labelCounts = new Map<string, number>();

    availableAnimationClips.forEach((clip, index) => {
      const baseLabel =
        clip.name.split("|").pop()?.trim() || `Animation ${index + 1}`;
      const nextCount = (labelCounts.get(baseLabel) ?? 0) + 1;
      labelCounts.set(baseLabel, nextCount);
      const label = nextCount > 1 ? `${baseLabel} (${nextCount})` : baseLabel;
      entries[label] = index;
    });

    entries["NO ANIMATION"] = null;

    return entries;
  }, [availableAnimationClips]);

  useControls(() => {
    return {
      Animations: folder(
        {
          [assetLabel]: {
            value: currentAnimationIndex,
            options: animationNameEntries,
            onChange: (newIndex: number | null) => {
              setCurrentAnimationIndex(newIndex);
            },
          },
        },
        {
          order: PANEL_ORDER_ANIMATIONS,
          render: () => availableAnimationClips.length > 0,
        }
      ),
    };
  }, [availableAnimationClips, currentAnimationIndex, animationNameEntries]);
};
