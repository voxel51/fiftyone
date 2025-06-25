/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useCallback, useEffect, useState } from "react";
import { PixiResourceLoader } from "../resource/PixiResourceLoader";
import type { LoadOptions } from "../resource/ResourceLoader";

/**
 * Hook for creating and managing a PixiResourceLoader instance.
 */
export const usePixiResourceLoader = () => {
  const [resourceLoader, setResourceLoader] =
    useState<PixiResourceLoader | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const pixiResourceLoader = new PixiResourceLoader();
    setResourceLoader(pixiResourceLoader);
    setIsInitialized(true);

    return () => {
      setResourceLoader(null);
      setIsInitialized(false);
    };
  }, []);

  const load = useCallback(
    async <T>(url: string, options?: LoadOptions): Promise<T> => {
      if (resourceLoader) {
        return await resourceLoader.load<T>(url, options);
      }
      throw new Error("ResourceLoader not initialized");
    },
    [resourceLoader]
  );

  const get = useCallback(
    <T>(url: string): T | undefined => {
      if (resourceLoader) {
        return resourceLoader.get<T>(url);
      }
      return undefined;
    },
    [resourceLoader]
  );

  const unload = useCallback(
    async (url: string): Promise<void> => {
      if (resourceLoader) {
        await resourceLoader.unload(url);
      }
    },
    [resourceLoader]
  );

  const loadMultiple = useCallback(
    async <T>(
      urls: string[],
      options?: LoadOptions
    ): Promise<Record<string, T>> => {
      if (resourceLoader) {
        return await resourceLoader.loadMultiple<T>(urls, options);
      }
      throw new Error("ResourceLoader not initialized");
    },
    [resourceLoader]
  );

  return {
    resourceLoader,
    isInitialized,
    load,
    get,
    unload,
    loadMultiple,
  };
};
