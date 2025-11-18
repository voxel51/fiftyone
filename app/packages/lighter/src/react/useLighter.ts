/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TransformOptions } from "../commands/TransformOverlayCommand";
import type { RenderCallback } from "../core/Scene2D";
import { defaultLighterSceneAtom, overlayFactory } from "../index";
import type { BaseOverlay } from "../overlay/BaseOverlay";

/**
 * Hook for accessing the current lighter instance without side effects.
 * This hook provides access to the lighter scene and its methods from anywhere in the app.
 *
 * It's very important to minimize side effects in this hook.
 *
 * @param atom - The atom in which the scene is stored.
 */
export const useLighter = (atom = defaultLighterSceneAtom) => {
  const scene = useAtomValue(atom);
  const isReady = !!scene;
  const registeredCallbacks = useRef<Set<() => void>>(new Set());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Cleanup registered callbacks when scene changes or component unmounts
  useEffect(() => {
    if (!scene) {
      return;
    }

    // assign referenced callbacks when the effect runs
    const callbacks = registeredCallbacks.current;

    return () => {
      // Unregister all callbacks when component unmounts or scene changes
      for (const unregister of callbacks) {
        unregister();
      }
      callbacks.clear();
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
  }, [registerRenderCallback, scene]);

  const addOverlay = useCallback(
    (overlay: BaseOverlay, withUndo = false) => {
      if (scene) {
        scene.addOverlay(overlay, withUndo);
      }
    },
    [scene]
  );

  const removeOverlay = useCallback(
    (id: string, withUndo = false) => {
      if (scene) {
        scene.removeOverlay(id, withUndo);
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
    if (scene?.canUndo()) {
      scene.undo();
    }
  }, [scene]);

  const redo = useCallback(() => {
    if (scene?.canRedo()) {
      scene.redo();
    }
  }, [scene]);

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
