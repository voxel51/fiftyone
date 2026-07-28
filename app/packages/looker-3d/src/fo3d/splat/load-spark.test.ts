import { beforeEach, describe, expect, it, vi } from "vitest";

const spark = vi.hoisted(() => ({ moduleLoads: vi.fn() }));

vi.mock("@sparkjsdev/spark", () => {
  spark.moduleLoads();
  return { SparkRenderer: class SparkRenderer {} };
});

beforeEach(() => {
  vi.resetModules();
  spark.moduleLoads.mockClear();
});

describe("loadSpark", () => {
  it("defers and deduplicates the Spark module import", async () => {
    const { loadSpark } = await import("./load-spark");

    expect(spark.moduleLoads).not.toHaveBeenCalled();

    const firstLoad = loadSpark();
    const secondLoad = loadSpark();

    expect(secondLoad).toBe(firstLoad);
    await firstLoad;
    expect(spark.moduleLoads).toHaveBeenCalledOnce();
  });

  it("retries after an import failure", async () => {
    const { createLazyModuleLoader } = await import("./load-spark");
    const sparkModule = { SparkRenderer: class SparkRenderer {} };
    const importSpark = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValue(sparkModule);
    const loadSparkWithRetry = createLazyModuleLoader(importSpark);

    await expect(loadSparkWithRetry()).rejects.toThrow("chunk unavailable");
    await expect(loadSparkWithRetry()).resolves.toBe(sparkModule);
    expect(importSpark).toHaveBeenCalledTimes(2);
  });
});
