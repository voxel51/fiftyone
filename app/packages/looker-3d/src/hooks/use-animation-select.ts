import { useFrame } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { useEffect, useMemo, useState } from "react";
import { AnimationClip, AnimationMixer } from "three";
import { PANEL_ORDER_ANIMATIONS } from "../constants";

export const useAnimationSelect = (
  assetLabel: string,
  animationClips: AnimationClip[],
  mixer: AnimationMixer
) => {
  const [currentAnimationIndex, setCurrentAnimationIndex] = useState(
    animationClips.length > 0 ? 0 : null
  );

  useEffect(() => {
    if (currentAnimationIndex === null) {
      return;
    }

    const action = mixer.clipAction(animationClips[currentAnimationIndex]);

    if (action) {
      action.play();
    }

    return () => {
      mixer.stopAllAction();
    };
  }, [animationClips, currentAnimationIndex, mixer]);

  useFrame((_state, delta) => {
    mixer.update(delta);
  });

  const animationNameEntries = useMemo(() => {
    const entries = Object.fromEntries(
      animationClips.map((clip, index) => [clip.name.split("|").pop(), index])
    );

    entries["NO ANIMATION"] = null;

    return entries;
  }, [animationClips]);

  useControls(() => {
    return {
      Animations: folder(
        {
          [assetLabel]: {
            value: currentAnimationIndex,
            options: animationNameEntries,
            onChange: (newIndex: number) => {
              setCurrentAnimationIndex(newIndex);
            },
          },
        },
        {
          order: PANEL_ORDER_ANIMATIONS,
        }
      ),
    };
  });
};
