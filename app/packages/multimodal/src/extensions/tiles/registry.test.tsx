import { IconName } from "@voxel51/voodo";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEpisodeTileExtensions,
  registerEpisodeTileExtension,
  resetEpisodeTileExtensionsForTests,
} from "./registry";
import type { EpisodeTileExtension } from "./types";

const extension: EpisodeTileExtension = {
  icon: IconName.JSON,
  id: "test:events",
  isAvailable: () => true,
  order: 10,
  Tile: () => React.createElement("div"),
  typeLabel: "Events",
};

afterEach(resetEpisodeTileExtensionsForTests);

describe("episode tile extension registry", () => {
  it("shares one registry across duplicate module evaluations", async () => {
    registerEpisodeTileExtension(extension);
    vi.resetModules();
    const reloaded = await import("./registry");

    expect(() =>
      reloaded.registerEpisodeTileExtension({ ...extension }),
    ).toThrow("Duplicate episode tile extension id: test:events");
  });

  it("orders contributions explicitly and rejects conflicting ids", () => {
    registerEpisodeTileExtension({ ...extension, id: "test:later", order: 20 });
    registerEpisodeTileExtension(extension);

    expect(getEpisodeTileExtensions().map(({ id }) => id)).toEqual([
      "test:events",
      "test:later",
    ]);
    expect(() => registerEpisodeTileExtension(extension)).not.toThrow();
    expect(() => registerEpisodeTileExtension({ ...extension })).toThrow(
      "Duplicate episode tile extension id: test:events",
    );
  });

  it("requires a non-empty namespace and local name", () => {
    expect(() =>
      registerEpisodeTileExtension({
        ...extension,
        id: "missing-namespace" as "test:events",
      }),
    ).toThrow("Episode tile extension ids must be namespaced");
  });
});
