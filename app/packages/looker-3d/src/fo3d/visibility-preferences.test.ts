import { describe, expect, it } from "vitest";
import type { FoScene, FoSceneNode } from "./render-types";
import { getVisibilityMapFromFo3dParsed } from "./utils";

const node = (
  name: string,
  visible: boolean,
  children: FoSceneNode[] = [],
): FoSceneNode =>
  ({
    name,
    visible,
    children,
  }) as FoSceneNode;

const sceneOf = (children: FoSceneNode[]) => ({ children }) as FoScene;

/** Leva folders nest, so flatten to `name -> value` for assertions. */
const flatten = (schema: Record<string, unknown>): Record<string, boolean> => {
  const out: Record<string, boolean> = {};

  const walk = (entries: Record<string, unknown>) => {
    for (const [key, entry] of Object.entries(entries)) {
      if (typeof entry === "boolean") {
        out[key] = entry;
        continue;
      }
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as Record<string, unknown>;
      // A leva folder carries its children under `schema`.
      if (record.schema && typeof record.schema === "object") {
        walk(record.schema as Record<string, unknown>);
        continue;
      }
      if (typeof record.value === "boolean") {
        out[key] = record.value;
      }
    }
  };

  walk(schema);
  return out;
};

describe("getVisibilityMapFromFo3dParsed", () => {
  it("returns null without a scene", () => {
    expect(
      getVisibilityMapFromFo3dParsed(null as unknown as FoScene),
    ).toBeNull();
  });

  it("uses the scene's authored visibility with no saved preferences", () => {
    const scene = sceneOf([node("pointcloud", true), node("mesh", false)]);

    expect(flatten(getVisibilityMapFromFo3dParsed(scene))).toEqual({
      pointcloud: true,
      mesh: false,
    });
  });

  it("lets a saved preference override the authored default", () => {
    // The reported bug: hiding a point cloud didn't survive a refresh.
    const scene = sceneOf([node("pointcloud", true), node("mesh", true)]);

    expect(
      flatten(getVisibilityMapFromFo3dParsed(scene, { pointcloud: false })),
    ).toEqual({
      pointcloud: false,
      mesh: true,
    });
  });

  it("can also re-show a node the scene authored as hidden", () => {
    const scene = sceneOf([node("pointcloud", false)]);

    expect(
      flatten(getVisibilityMapFromFo3dParsed(scene, { pointcloud: true })),
    ).toEqual({ pointcloud: true });
  });

  it("ignores saved names that aren't in this scene", () => {
    // A map left from a different scene graph must not affect this one.
    const scene = sceneOf([node("pointcloud", true)]);

    const flat = flatten(
      getVisibilityMapFromFo3dParsed(scene, {
        somethingElse: false,
        anotherThing: false,
      }),
    );

    expect(flat).toEqual({ pointcloud: true });
  });

  it("ignores non-boolean saved values rather than trusting them", () => {
    const scene = sceneOf([node("pointcloud", true)]);

    const flat = flatten(
      getVisibilityMapFromFo3dParsed(scene, {
        pointcloud: "false" as unknown as boolean,
      }),
    );

    expect(flat).toEqual({ pointcloud: true });
  });

  it("applies saved preferences to nested nodes too", () => {
    const scene = sceneOf([
      node("group", true, [node("child", true), node("sibling", true)]),
    ]);

    const flat = flatten(
      getVisibilityMapFromFo3dParsed(scene, { child: false, group: false }),
    );

    expect(flat.child).toBe(false);
    expect(flat.group).toBe(false);
    expect(flat.sibling).toBe(true);
  });
});
