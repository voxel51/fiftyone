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
});
