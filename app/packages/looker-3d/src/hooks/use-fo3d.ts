import * as fos from "@fiftyone/state";
import { useEffect, useMemo, useState } from "react";
import { useSetRecoilState } from "recoil";
import { Quaternion, Vector3 } from "three";
import { getResolvedUrlForFo3dAsset } from "../fo3d/utils";
import type {
  FiftyoneSceneRawJson,
  FoSceneBackground,
  FoSceneRawNode,
} from "../utils";
import useFo3dFetcher from "./use-fo3d-fetcher";

export const Fo3dSupportedExtensions = [
  ".pcd",
  ".ply",
  ".stl",
  ".obj",
  ".mtl",
  ".gltf",
  ".glb",
  ".fbx",
];
export class BoxGeometryAsset {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly depth: number,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export class CylinderGeometryAsset {
  constructor(
    readonly radiusTop: number,
    readonly radiusBottom: number,
    readonly height: number,
    readonly radialSegments: number,
    readonly heightSegments: number,
    readonly openEnded: boolean,
    readonly thetaStart: number,
    readonly thetaLength: number,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export class PlaneGeometryAsset {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export class SphereGeometryAsset {
  constructor(
    readonly radius: number,
    readonly widthSegments: number,
    readonly heightSegments: number,
    readonly phiStart: number,
    readonly phiLength: number,
    readonly thetaStart: number,
    readonly thetaLength: number,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export class FbxAsset {
  constructor(
    readonly fbxPath: string,
    readonly preTransformedFbxPath?: string,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export class GltfAsset {
  constructor(
    readonly gltfPath: string,
    readonly preTransformedGltfPath?: string,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export class ObjAsset {
  constructor(
    readonly objPath?: string,
    readonly mtlPath?: string,
    readonly preTransformedObjPath?: string,
    readonly preTransformedMtlPath?: string,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export class PcdAsset {
  constructor(
    readonly pcdPath?: string,
    readonly preTransformedPcdPath?: string,
    readonly defaultMaterial?: FoPointcloudMaterialProps,
    readonly centerGeometry?: boolean
  ) {}
}

export class PlyAsset {
  constructor(
    readonly plyPath?: string,
    readonly preTransformedPlyPath?: string,
    readonly defaultMaterial?: FoMeshMaterial,
    readonly isPcd?: boolean,
    readonly centerGeometry?: boolean
  ) {}
}

export class StlAsset {
  constructor(
    readonly stlPath?: string,
    readonly preTransformedStlPath?: string,
    readonly defaultMaterial?: FoMeshMaterial
  ) {}
}

export type MeshAsset =
  | FbxAsset
  | GltfAsset
  | ObjAsset
  | PcdAsset
  | PlyAsset
  | StlAsset
  | BoxGeometryAsset
  | CylinderGeometryAsset
  | PlaneGeometryAsset
  | SphereGeometryAsset;

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

export type FoMeshStandardMaterialProps = FoMeshMaterialBase & {
  _type: "MeshStandardMaterial";
  color: string;
  emissiveColor: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
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
  | FoMeshStandardMaterialProps
  | FoMeshLambertMaterialProps
  | FoMeshPhongMaterialProps
  | FoMeshDepthMaterialProps;

export type FoPointcloudMaterialProps = FoMaterial3D & {
  _type: "PointCloudMaterial";
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

export type FoScene = Omit<FoSceneNode, "name" | "visible" | "uuid"> & {
  background: FiftyoneSceneRawJson["background"];
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
export const useFo3d = (
  url: string,
  filepath: string,
  fo3dRoot: string
): UseFo3dReturnType => {
  const [isLoading, setIsLoading] = useState(true);
  const [rawData, setRawData] = useState<FiftyoneSceneRawJson | null>(null);

  const setFo3dContent = useSetRecoilState(fos.fo3dContent);

  const fetchFo3d = useFo3dFetcher();

  useEffect(() => {
    fetchFo3d(url, filepath).then((response) => {
      setRawData(response);
      setIsLoading(false);
    });
  }, [url, filepath, fetchFo3d]);

  useEffect(() => {
    if (!rawData) {
      return;
    }

    // recursively remove all attributes that start with "preTransformed" from the raw data
    // `preTransformed` is not relevant in OSS
    const removePreTransformedAttributes = (node: FoSceneRawNode) => {
      for (const key in node) {
        if (key.startsWith("preTransformed")) {
          delete node[key];
        }
      }

      if (node.children) {
        node.children.forEach(removePreTransformedAttributes);
      }
    };

    removePreTransformedAttributes(rawData);

    setFo3dContent(rawData);
  }, [rawData]);

  const foScene = useMemo(() => {
    if (!rawData) {
      return null;
    }

    const buildSceneGraph = (node: FoSceneRawNode) => {
      let asset: MeshAsset;
      const material = node.defaultMaterial;

      if (node["_type"].toLocaleLowerCase().endsWith("mesh")) {
        if (node["_type"].toLocaleLowerCase().startsWith("fbx")) {
          if (node["fbxPath"]) {
            asset = new FbxAsset(
              node["fbxPath"],
              node["preTransformedFbxPath"],
              material as FoMeshMaterial
            );
          }
        } else if (node["_type"].toLocaleLowerCase().startsWith("gltf")) {
          if (node["gltfPath"]) {
            asset = new GltfAsset(
              node["gltfPath"],
              node["preTransformedGltfPath"],
              material as FoMeshMaterial
            );
          }
        } else if (node["_type"].toLocaleLowerCase().startsWith("obj")) {
          if (node["objPath"]) {
            asset = new ObjAsset(
              node["objPath"],
              node["mtlPath"],
              node["preTransformedObjPath"],
              node["preTransformedMtlPath"],
              material as FoMeshMaterial
            );
          }
        } else if (node["_type"].toLocaleLowerCase().startsWith("stl")) {
          if (node["stlPath"]) {
            asset = new StlAsset(
              node["stlPath"],
              node["preTransformedStlPath"],
              material as FoMeshMaterial
            );
          }
        } else if (node["_type"].toLocaleLowerCase().startsWith("ply")) {
          if (node["plyPath"]) {
            asset = new PlyAsset(
              node["plyPath"],
              node["preTransformedPlyPath"],
              material as FoMeshMaterial,
              node["isPointCloud"] ?? false,
              node["centerGeometry"] ?? true
            );
          }
        }
      } else if (node["_type"].endsWith("PointCloud")) {
        if (node["pcdPath"]) {
          asset = new PcdAsset(
            node["pcdPath"],
            node["preTransformedPcdPath"],
            material as FoPointcloudMaterialProps,
            node["centerGeometry"] ?? false
          );
        }
      } else if (node["_type"].endsWith("Geometry")) {
        if (node["_type"].startsWith("Box")) {
          asset = new BoxGeometryAsset(
            node["width"],
            node["height"],
            node["depth"],
            material as FoMeshMaterial
          );
        } else if (node["_type"].startsWith("Cylinder")) {
          asset = new CylinderGeometryAsset(
            node["radiusTop"],
            node["radiusBottom"],
            node["height"],
            node["radialSegments"],
            node["heightSegments"],
            node["openEnded"],
            node["thetaStart"],
            node["thetaLength"],
            material as FoMeshMaterial
          );
        } else if (node["_type"].endsWith("PlaneGeometry")) {
          asset = new PlaneGeometryAsset(
            node["width"],
            node["height"],
            material as FoMeshMaterial
          );
        } else if (node["_type"].endsWith("SphereGeometry")) {
          asset = new SphereGeometryAsset(
            node["radius"],
            node["widthSegments"],
            node["heightSegments"],
            node["phiStart"],
            node["phiLength"],
            node["thetaStart"],
            node["thetaLength"],
            material as FoMeshMaterial
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

    // if scene background has relative paths, resolve them
    if (rawData.background?.image) {
      rawData.background.image = getResolvedUrlForFo3dAsset(
        rawData.background.image,
        fo3dRoot
      );
    }

    if (rawData.background?.cube) {
      rawData.background.cube = rawData.background.cube.map((cubePath) =>
        getResolvedUrlForFo3dAsset(cubePath, fo3dRoot)
      ) as FoSceneBackground["cube"];
    }

    const toReturn: FoScene = {
      cameraProps: rawData.camera,
      lights: rawData.lights,
      background: rawData.background,
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
  }, [rawData, fo3dRoot]);

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
