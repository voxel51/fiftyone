import { getSampleSrc } from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useMemo, useState } from "react";
import { Quaternion, Vector3 } from "three";
import { FiftyoneSceneRawJson } from "../utils";

export class GltfAsset {
  constructor(readonly gltfUrl?: string) {}
}

export class ObjAsset {
  constructor(readonly objUrl?: string, readonly mtlUrl?: string) {}
}

export class PcdAsset {
  constructor(readonly pcdUrl?: string) {}
}

export class PlyAsset {
  constructor(readonly plyUrl?: string) {}
}

export class StlAsset {
  constructor(readonly stlUrl?: string) {}
}

export type MeshAsset = GltfAsset | ObjAsset | PcdAsset | PlyAsset | StlAsset;

export type FoSceneNode = {
  name: string;
  asset?: MeshAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  visible: boolean;
  children?: Array<FoSceneNode> | null;
};

export type FoSceneGraph = Omit<FoSceneNode, "name" | "visible"> & {
  defaultCameraPosition?: Vector3 | null;
  children?: Array<FoSceneNode> | null;
};

type UseFo3dReturnType = {
  sceneGraph: FoSceneGraph | null;
  isLoading: boolean;
};

/**
 * This hook parses the fo3d file into a FiftyOne scene graph.
 */
export const useFo3d = (url: string): UseFo3dReturnType => {
  const [isLoading, setIsLoading] = useState(true);
  const [rawData, setRawData] = useState<FiftyoneSceneRawJson | null>(null);

  useEffect(() => {
    (async () => {
      const response: FiftyoneSceneRawJson = await getFetchFunction()(
        "GET",
        url
      );
      setRawData(response);
      setIsLoading(false);
    })();
  }, [url]);

  const sceneGraph = useMemo(() => {
    if (!rawData) {
      return null;
    }

    const buildSceneGraph = (node: FiftyoneSceneRawJson["children"][0]) => {
      let asset: MeshAsset;

      if (node["_cls"].toLocaleLowerCase().endsWith("mesh")) {
        if (node["_cls"].toLocaleLowerCase().startsWith("gltf")) {
          if (node["gltf_path"]) {
            asset = new GltfAsset(getSampleSrc(node["gltf_path"]));
          }
        } else if (node["_cls"].toLocaleLowerCase().startsWith("obj")) {
          if (node["obj_path"]) {
            const objPath = node["obj_path"];
            const mtlPath = node["mtl_path"];
            if (mtlPath) {
              asset = new ObjAsset(
                getSampleSrc(objPath),
                getSampleSrc(mtlPath)
              );
            } else {
              asset = new ObjAsset(getSampleSrc(objPath));
            }
          }
        } else if (node["_cls"].toLocaleLowerCase().startsWith("stl")) {
          if (node["stl_path"]) {
            asset = new StlAsset(getSampleSrc(node["stl_path"]));
          }
        } else if (node["_cls"].toLocaleLowerCase().startsWith("ply")) {
          if (node["ply_path"]) {
            asset = new PlyAsset(getSampleSrc(node["ply_path"]));
          }
        }
      } else if (node["_cls"].endsWith("Pointcloud")) {
        if (node["pcd_path"]) {
          asset = new PcdAsset(getSampleSrc(node["pcd_path"]));
        }
      }

      return {
        asset,
        name: node.name,
        visible: node.visible,
        position: new Vector3(
          node.position[0],
          node.position[1],
          node.position[2]
        ),
        quaternion: new Quaternion(
          node.quaternion[0],
          node.quaternion[1],
          node.quaternion[2],
          node.quaternion[3]
        ),
        scale: new Vector3(node.scale[0], node.scale[1], node.scale[2]),
        children:
          node.children?.length > 0 ? node.children.map(buildSceneGraph) : null,
      };
    };

    let cameraPosition: Vector3 | null = null;

    if (rawData.default_camera_position?.length === 3) {
      cameraPosition = new Vector3(
        rawData.default_camera_position[0],
        rawData.default_camera_position[1],
        rawData.default_camera_position[2]
      );
    }

    const foSceneGraph: FoSceneGraph = {
      defaultCameraPosition: cameraPosition,
      position: new Vector3(
        rawData.position[0],
        rawData.position[1],
        rawData.position[2]
      ),
      quaternion: new Quaternion(
        rawData.quaternion[0],
        rawData.quaternion[1],
        rawData.quaternion[2],
        rawData.quaternion[3]
      ),
      scale: new Vector3(rawData.scale[0], rawData.scale[1], rawData.scale[2]),
      children: rawData.children.map(buildSceneGraph),
    };

    return foSceneGraph;
  }, [rawData]);

  if (isLoading) {
    return {
      sceneGraph: null,
      isLoading,
    };
  }

  return {
    sceneGraph,
    isLoading: false,
  } as UseFo3dReturnType;
};
