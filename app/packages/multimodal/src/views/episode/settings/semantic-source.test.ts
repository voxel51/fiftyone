import { describe, expect, it } from "vitest";
import type { SceneSource } from "../../../ir";
import {
  createSemanticSourceIndex,
  groupSourcesBySemanticIdentity,
  semanticSourceKey,
  semanticSourceKeysForRuntimeIds,
  resolveSemanticSourceKeys,
} from "./semantic-source";

const source = (id: string, type: string, sourceName: string): SceneSource => ({
  id,
  label: sourceName,
  sourceName,
  type,
});

describe("semantic source identity", () => {
  it("is collision-safe", () => {
    expect(semanticSourceKey(source("1", "a", "b\0c"))).not.toBe(
      semanticSourceKey(source("2", "a\0b", "c")),
    );
  });

  it("remaps changing runtime ids and groups duplicate semantic channels", () => {
    const lidarKey = semanticSourceKey(source("1", "point-cloud", "/lidar"));
    const first = createSemanticSourceIndex([
      source("1", "point-cloud", "/lidar"),
      source("2", "point-cloud", "/lidar"),
      source("3", "scene-annotation", "/boxes"),
    ]);
    const next = createSemanticSourceIndex([
      source("41", "point-cloud", "/lidar"),
      source("42", "point-cloud", "/lidar"),
      source("43", "scene-annotation", "/boxes"),
    ]);

    expect(resolveSemanticSourceKeys([lidarKey], first)).toEqual(["1", "2"]);
    expect(resolveSemanticSourceKeys([lidarKey], next)).toEqual(["41", "42"]);
    expect(semanticSourceKeysForRuntimeIds(["41", "42"], next)).toEqual([
      lidarKey,
    ]);
    expect(
      groupSourcesBySemanticIdentity([
        source("41", "point-cloud", "/lidar"),
        source("42", "point-cloud", "/lidar"),
      ]),
    ).toHaveLength(1);
  });

  it("keeps unavailable keys latent and does not enable newly discovered keys", () => {
    const lidarKey = semanticSourceKey(source("1", "point-cloud", "/lidar"));
    const absent = createSemanticSourceIndex([
      source("2", "scene-annotation", "/boxes"),
    ]);
    const returned = createSemanticSourceIndex([
      source("80", "point-cloud", "/lidar"),
      source("81", "point-cloud", "/new-cloud"),
    ]);

    expect(resolveSemanticSourceKeys([lidarKey], absent)).toEqual([]);
    expect(resolveSemanticSourceKeys([lidarKey], returned)).toEqual(["80"]);
  });
});
