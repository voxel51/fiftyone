/** Runtime exports from the optional Spark renderer package. */
export type SparkModule = typeof import("@sparkjsdev/spark");

let sparkModulePromise: Promise<SparkModule> | undefined;

/** Loads Spark once, when the first Gaussian splat consumer mounts. */
export const loadSpark = () => {
  sparkModulePromise ??= import("@sparkjsdev/spark");
  return sparkModulePromise;
};
