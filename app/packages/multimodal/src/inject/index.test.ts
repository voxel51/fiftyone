import { afterEach, describe, expect, it, vi } from "vitest";
import { getEpisodeTileExtension } from "../extensions/tiles/registry";
import {
  getFormatAdapterDescriptors,
  resetFormatAdapterRegistryForTests,
} from "../runtime/adapter-registry";

vi.mock("@fiftyone/plugins", () => ({
  PluginComponentType: { Panel: "Panel", SampleRenderer: "SampleRenderer" },
  registerComponent: vi.fn(),
  SAMPLE_RENDERER_GRID_SLOT: { HEADER_AFTER_RESOURCE_COUNT: "slot" },
}));

afterEach(() => resetFormatAdapterRegistryForTests());

describe("injection root composition", () => {
  // Deliberately heavy: load() pulls the real format adapter and the whole
  // tile chunk, which under full-suite transform contention outlives the
  // default timeout.
  it(
    "registers the LeRobot tile extension with the format's lazy load",
    {
      timeout: 30_000,
    },
    async () => {
      await import("./index");

      const descriptor = getFormatAdapterDescriptors().find(
        (candidate) => candidate.id === "lerobot-v3",
      );
      expect(descriptor).toBeDefined();
      // The composed descriptor stays lazy: registering it loads nothing.
      expect(getEpisodeTileExtension("lerobot:state-action")).toBeNull();

      const adapter = await descriptor?.load();
      expect(adapter).toBeDefined();
      // The tile extension exists as soon as load() resolves — before any
      // opened session can expose hasStateAction to the catalog.
      expect(getEpisodeTileExtension("lerobot:state-action")).not.toBeNull();
    },
  );
});
