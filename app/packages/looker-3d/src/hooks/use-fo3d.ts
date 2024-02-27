import { getSampleSrc } from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useMemo, useState } from "react";
import { Quaternion, Vector3 } from "three";
import { FiftyoneSceneRawJson } from "../utils";

export class FbxAsset {
  constructor(readonly fbxUrl?: string) {}
}

export class GltfAsset {
  constructor(readonly gltfUrl?: string) {}
}

export class ObjAsset {
  constructor(
    readonly objUrl?: string,
    readonly mtlUrl?: string,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export class PcdAsset {
  constructor(
    readonly pcdUrl?: string,
    readonly defaultMaterial?: FoPointcloudMaterialProps
  ) {}
}

export class PlyAsset {
  constructor(
    readonly plyUrl?: string,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export class StlAsset {
  constructor(
    readonly stlUrl?: string,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export type MeshAsset =
  | FbxAsset
  | GltfAsset
  | ObjAsset
  | PcdAsset
  | PlyAsset
  | StlAsset;

export type FoMaterial3D = {
  opacity: number;
  vertexColors: boolean;
};

export type FoMeshMaterialBase = FoMaterial3D & {
  wireframe: boolean;
};

export type FoMeshBasicMaterialProps = FoMeshMaterialBase & {
  _type: "MeshBasicMaterial";
  color: string;
};

export type FoMeshLambertMaterialProps = FoMeshMaterialBase & {
  _type: "MeshLambertMaterial";
  color: string;
  emissiveColor: string;
  emissiveIntensity: number;
  reflectivity: number;
  refractionRatio: number;
};

export type FoMeshPhongMaterialProps = Omit<
  FoMeshLambertMaterialProps,
  "_type"
> & {
  _type: "MeshPhongMaterial";
  shininess: number;
  specularColor: string;
};

export type FoMeshDepthMaterialProps = FoMeshMaterialBase & {
  _type: "MeshDepthMaterial";
};

export type FoMeshMaterial =
  | FoMeshBasicMaterialProps
  | FoMeshLambertMaterialProps
  | FoMeshPhongMaterialProps
  | FoMeshDepthMaterialProps;

export type FoPointcloudMaterialProps = FoMaterial3D & {
  _type: "PointcloudMaterial";
  shadingMode: "height" | "intensity" | "rgb" | "custom";
  customColor: string;
  pointSize: number;
  attenuateByDistance: boolean;
};

export type FoSceneNode = {
  uuid: string;
  name: string;
  asset?: MeshAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  visible: boolean;
  children?: Array<FoSceneNode> | null;
};

export type FoScene = Omit<FoSceneNode, "name" | "visible"> & {
  cameraProps: FiftyoneSceneRawJson["camera"];
  lights: FiftyoneSceneRawJson["lights"];
  children?: Array<FoSceneNode> | null;
};

type UseFo3dReturnType = {
  foScene: FoScene | null;
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

  const foScene = useMemo(() => {
    if (!rawData) {
      return null;
    }

    const buildSceneGraph = (node: FiftyoneSceneRawJson["children"][0]) => {
      let asset: MeshAsset;

      const material = node.defaultMaterial;

      if (node["_type"].toLocaleLowerCase().endsWith("mesh")) {
        if (node["_type"].toLocaleLowerCase().startsWith("fbx")) {
          if (node["fbxPath"]) {
            asset = new FbxAsset(getSampleSrc(node["fbxPath"]));
          }
        } else if (node["_type"].toLocaleLowerCase().startsWith("gltf")) {
          if (node["gltfPath"]) {
            asset = new GltfAsset(getSampleSrc(node["gltfPath"]));
          }
        } else if (node["_type"].toLocaleLowerCase().startsWith("obj")) {
          if (node["objPath"]) {
            const objPath = node["objPath"];
            const mtlPath = node["mtlPath"];
            if (mtlPath) {
              asset = new ObjAsset(
                getSampleSrc(objPath),
                getSampleSrc(mtlPath),
                material as FoMeshMaterial
              );
            } else {
              asset = new ObjAsset(
                getSampleSrc(objPath),
                undefined,
                material as FoMeshMaterial
              );
            }
          }
        } else if (node["_type"].toLocaleLowerCase().startsWith("stl")) {
          if (node["stlPath"]) {
            asset = new StlAsset(
              getSampleSrc(node["stlPath"]),
              material as FoMeshMaterial
            );
          }
        } else if (node["_type"].toLocaleLowerCase().startsWith("ply")) {
          if (node["plyPath"]) {
            asset = new PlyAsset(
              getSampleSrc(node["plyPath"]),
              material as FoMeshMaterial
            );
          }
        }
      } else if (node["_type"].endsWith("Pointcloud")) {
        if (node["pcdPath"]) {
          asset = new PcdAsset(
            getSampleSrc(node["pcdPath"]),
            material as FoPointcloudMaterialProps
          );
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

    const toReturn: FoScene = {
      cameraProps: rawData.camera,
      lights: rawData.lights,
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

    return toReturn;
  }, [rawData]);

  if (isLoading) {
    return {
      foScene: null,
      isLoading,
    };
  }

  return {
    foScene,
    isLoading: false,
  } as UseFo3dReturnType;
};
