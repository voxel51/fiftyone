/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { TransformOptions } from "../commands/TransformOverlayCommand";
import type { RenderCallback } from "../core/Scene2D";
import { lighterSceneAtom, overlayFactory } from "../index";
import { BaseOverlay } from "../overlay/BaseOverlay";

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

  // useLighter() consumers may cache callback that closes over `scene` and that can result in memory leak.
  // Use ref to avoid capturing `scene` directly in useCallback closures.
  //
  // The returned action callbacks (addOverlay, removeOverlay, etc.) are stable
  // and read `sceneRef.current` at call time. This is safe because
  // they are imperative functions invoked in response to user actions, not used
  // to drive renders or effects. Components that need to react to scene changes
  // should use the `scene` value returned directly from this hook.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  // Cleanup registered callbacks when scene changes or component unmounts
  useEffect(() => {
    return () => {
      // Unregister all callbacks when component unmounts or scene changes
      registeredCallbacks.current.forEach((unregister) => unregister());
      registeredCallbacks.current.clear();
    };
  }, [scene]);

  const addOverlay = useCallback(
    (overlay: BaseOverlay, withUndo: boolean = false) => {
      if (sceneRef.current) {
        sceneRef.current.addOverlay(overlay, withUndo);
      }
    },
    []
  );

  const removeOverlay = useCallback((id: string, withUndo: boolean = false) => {
    if (sceneRef.current) {
      sceneRef.current.removeOverlay(id, withUndo);
    }
  }, []);

  const getOverlay = useCallback((id: string) => {
    if (sceneRef.current) {
      return sceneRef.current.getOverlay(id);
    }
    return undefined;
  }, []);

  const transformOverlay = useCallback(
    async (id: string, options: TransformOptions) => {
      if (sceneRef.current) {
        return await sceneRef.current.transformOverlay(id, options);
      }
      return false;
    },
    []
  );

  /**
   * Registers a render callback that will be automatically cleaned up when the component unmounts.
   * @param callback - The callback configuration.
   * @returns A function to manually unregister the callback.
   */
  const registerRenderCallback = useCallback(
    (callback: Omit<RenderCallback, "id"> & { id?: string }) => {
      const s = sceneRef.current;

      if (!s) {
        console.warn("Cannot register render callback: scene not ready");
        return () => {}; // Return no-op function
      }

      const unregister = s.registerRenderCallback(callback);
      registeredCallbacks.current.add(unregister);

      // Return a function that removes from our tracking and unregisters
      return () => {
        registeredCallbacks.current.delete(unregister);
        unregister();
      };
    },
    []
  );

  return {
    scene,
    isReady,
    addOverlay,
    removeOverlay,
    getOverlay,
    transformOverlay,
    overlayFactory,
    registerRenderCallback,
  };
};
