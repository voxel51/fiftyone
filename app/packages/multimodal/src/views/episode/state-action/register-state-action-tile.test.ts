import { describe, expect, it } from "vitest";
import { leRobotAdapterDescriptor } from "../../../adapters/lerobot/descriptor";
import { getEpisodeTileExtension } from "../../../extensions/tiles/registry";
import { TILE_TYPE } from "../tiles/tile-types";
import { tileTypesFor } from "../shell/tile-catalog";

describe("lerobot:state-action registration", () => {
  it("registers only through the lazy LeRobot chunk, before open can run", async () => {
    // Importing the eager descriptor must not register the tile: no
    // LeRobot table code loads for ordinary media or MCAP-only sessions.
    expect(getEpisodeTileExtension("lerobot:state-action")).toBeNull();

    await leRobotAdapterDescriptor.load();

    const extension = getEpisodeTileExtension("lerobot:state-action");
    expect(extension).not.toBeNull();
    expect(extension?.typeLabel).toBe("State & Action");
    expect(extension?.isAvailable).toBeDefined();
  });

  it("appears in the catalog only when the session exposes the capability", async () => {
    await leRobotAdapterDescriptor.load();

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
    await leRobotAdapterDescriptor.load();
    await expect(leRobotAdapterDescriptor.load()).resolves.toBeDefined();
    expect(getEpisodeTileExtension("lerobot:state-action")).not.toBeNull();
  });
});
