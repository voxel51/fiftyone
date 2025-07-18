/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { overlayFactory } from "../index";
import { BaseOverlay } from "../overlay/BaseOverlay";
import { lighterSceneAtom } from "../state";

/**
 * Hook for accessing the current lighter instance without side effects.
 * This hook provides access to the lighter scene and its methods from anywhere in the app.
 *
 * It's important to not have any side effects in this hook.
 */
export const useLighter = () => {
  const scene = useAtomValue(lighterSceneAtom);
  const isReady = !!scene;

  const addOverlay = useCallback(
    (overlay: BaseOverlay) => {
      if (scene) {
        scene.addOverlay(overlay);
      }
    },
    [scene]
  );

  const removeOverlay = useCallback(
    (id: string) => {
      if (scene) {
        scene.removeOverlay(id);
      }
    },
    [scene]
  );

  const undo = useCallback(() => {
    if (scene && scene.canUndo()) {
      scene.undo();
    }
  }, [scene]);

  const redo = useCallback(() => {
    if (scene && scene.canRedo()) {
      scene.redo();
    }
  }, [scene]);

  const canUndo = useCallback(() => {
    return scene ? scene.canUndo() : false;
  }, [scene]);

  const canRedo = useCallback(() => {
    return scene ? scene.canRedo() : false;
  }, [scene]);

  return {
    scene,
    isReady,
    addOverlay,
    removeOverlay,
    undo,
    redo,
    canUndo,
    canRedo,
    overlayFactory,
  };
};
