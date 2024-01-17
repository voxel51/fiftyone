export type FiftyoneSceneRawJson = {
  _cls: string;
  name: string;
  visible: boolean;
  local_transform_matrix: [
    [number, number, number, number],
    [number, number, number, number],
    [number, number, number, number],
    [number, number, number, number]
  ];
  children: FiftyoneSceneRawJson[];
};

class InvalidSceneError extends Error {}

/**
 * Reads a raw JSON scene from FiftyOne and returns counts
 * of different media types in the scene.
 */
export const getFiftyoneSceneSummary = (scene: FiftyoneSceneRawJson) => {
  if (
    !Object.hasOwn(scene, "visible") ||
    !Object.hasOwn(scene, "local_transform_matrix") ||
    !Object.hasOwn(scene, "children") ||
    !Object.hasOwn(scene, "_cls") ||
    !Object.hasOwn(scene, "name") ||
    !Array.isArray(scene.children)
  ) {
    throw new InvalidSceneError();
  }

  let meshCount = 0;
  let pointcloudCount = 0;
  let unknownCount = 0;

  for (const child of scene.children) {
    if (child["_cls"].endsWith("Mesh")) {
      meshCount += 1;
    } else if (child["_cls"].endsWith("Pointcloud")) {
      pointcloudCount += 1;
    } else {
      unknownCount += 1;
    }

    if (child.children.length > 0) {
      const childSummary = getFiftyoneSceneSummary(child);
      meshCount += childSummary.meshCount;
      pointcloudCount += childSummary.pointcloudCount;
      unknownCount += childSummary.unknownCount;
    }
  }

  return {
    meshCount,
    pointcloudCount,
    unknownCount,
  };
};
