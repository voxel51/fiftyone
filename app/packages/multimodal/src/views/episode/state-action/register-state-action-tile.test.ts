import { describe, expect, it } from "vitest";
import { leRobotAdapterDescriptor } from "../../../adapters/lerobot/descriptor";
import { getEpisodeTileExtension } from "../../../extensions/tiles/registry";
import { TILE_TYPE } from "../tiles/tile-types";
import { tileTypesFor } from "../shell/tile-catalog";

describe("lerobot:state-action registration", () => {
  it("registers only through its lazy view chunk, never the adapter", async () => {
    // Importing the eager descriptor must not register the tile: no
    // LeRobot table code loads for ordinary media or MCAP-only sessions.
    expect(getEpisodeTileExtension("lerobot:state-action")).toBeNull();

    // The adapter layer is view-free: even a full format load registers
    // nothing — the injection root composes the view extension in.
    await leRobotAdapterDescriptor.load();
    expect(getEpisodeTileExtension("lerobot:state-action")).toBeNull();

    await import("./register-state-action-tile");

    const extension = getEpisodeTileExtension("lerobot:state-action");
    expect(extension).not.toBeNull();
    expect(extension?.typeLabel).toBe("State & Action");
    expect(extension?.isAvailable).toBeDefined();
  });

  it("appears in the catalog only when the session exposes the capability", async () => {
    await import("./register-state-action-tile");

    const withCapability = tileTypesFor({
      hasNumericSeries: true,
      hasRawRecords: true,
      hasStateAction: true,
      hasTransformTopology: false,
      sourceTypes: ["image"],
    });
    expect(withCapability).toEqual([
      TILE_TYPE.IMAGE,
      TILE_TYPE.PLOT,
      "lerobot:state-action",
      TILE_TYPE.RAW,
    ]);

    const withoutCapability = tileTypesFor({
      hasNumericSeries: true,
      hasRawRecords: true,
      hasStateAction: false,
      hasTransformTopology: false,
      sourceTypes: ["image"],
    });
    expect(withoutCapability).not.toContain("lerobot:state-action");
  });

  it("survives duplicate chunk evaluation without a conflict", async () => {
    await import("./register-state-action-tile");
    await expect(import("./register-state-action-tile")).resolves.toBeDefined();
    expect(getEpisodeTileExtension("lerobot:state-action")).not.toBeNull();
  });
});
