/** Runtime exports from the optional Spark renderer package. */
export type SparkModule = typeof import("@sparkjsdev/spark");

/** Creates a loader that caches successes and retries rejected imports. */
export const createLazyModuleLoader = <Module>(
  loadModule: () => Promise<Module>,
) => {
  let modulePromise: Promise<Module> | undefined;

  return () => {
    modulePromise ??= loadModule().catch((error) => {
      modulePromise = undefined;
      throw error;
    });

    return modulePromise;
  };
};

/**
 * Loads Spark once, when the first Gaussian splat consumer mounts.
 *
 * Spark is exact-pinned because this integration uses `loadInternalAsync`
 * and decoded splat containers' LoD data.
 */
export const loadSpark = createLazyModuleLoader<SparkModule>(
  () => import("@sparkjsdev/spark"),
);
