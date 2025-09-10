/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RenderCallback } from "../core/Scene2D";
import { lighterSceneAtom, overlayFactory } from "../index";
import { BaseOverlay } from "../overlay/BaseOverlay";
import type { TransformOptions } from "../commands/TransformOverlayCommand";

/**
 * Hook for accessing the current lighter instance without side effects.
 * This hook provides access to the lighter scene and its methods from anywhere in the app.
 *
 * It's very important to minimize side effects in this hook.
 */
export const useLighter = () => {
  const scene = useAtomValue(lighterSceneAtom);
  const isReady = !!scene;
  const registeredCallbacks = useRef<Set<() => void>>(new Set());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Cleanup registered callbacks when scene changes or component unmounts
  useEffect(() => {
    return () => {
      // Unregister all callbacks when component unmounts or scene changes
      registeredCallbacks.current.forEach((unregister) => unregister());
      registeredCallbacks.current.clear();
    };
  }, [scene]);

  // Update undo/redo state when scene changes
  useEffect(() => {
    if (scene) {
      setCanUndo(scene.canUndo());
      setCanRedo(scene.canRedo());
    } else {
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [scene]);

  // Register render callback to update undo/redo state
  useEffect(() => {
    if (!scene) return;

    return registerRenderCallback({
      callback: () => {
        setCanUndo(scene.canUndo());
        setCanRedo(scene.canRedo());
      },
      phase: "after",
    });
  }, [scene]);

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

  const getOverlay = useCallback(
    (id: string) => {
      if (scene) {
        return scene.getOverlay(id);
      }
      return undefined;
    },
    [scene]
  );

  const transformOverlay = useCallback(
    (id: string, options: TransformOptions) => {
      if (scene) {
        return scene.transformOverlay(id, options);
      }
      return false;
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

  /**
   * Registers a render callback that will be automatically cleaned up when the component unmounts.
   * @param callback - The callback configuration.
   * @returns A function to manually unregister the callback.
   */
  const registerRenderCallback = useCallback(
    (callback: Omit<RenderCallback, "id"> & { id?: string }) => {
      if (!scene) {
        console.warn("Cannot register render callback: scene not ready");
        return () => {}; // Return no-op function
      }

      const unregister = scene.registerRenderCallback(callback);
      registeredCallbacks.current.add(unregister);

      // Return a function that removes from our tracking and unregisters
      return () => {
        registeredCallbacks.current.delete(unregister);
        unregister();
      };
    },
    [scene]
  );

  return {
    scene,
    isReady,
    addOverlay,
    removeOverlay,
    getOverlay,
    transformOverlay,
    undo,
    redo,
    canUndo,
    canRedo,
    overlayFactory,
    registerRenderCallback,
  };
};
