import type { Quaternion, Vector3 } from "three";
import type { FiftyoneSceneRawJson } from "../utils";

export const Fo3dSupportedExtensions = [
  ".pcd",
  ".ply",
  ".stl",
  ".obj",
  ".mtl",
  ".gltf",
  ".glb",
  ".fbx",
] as const;

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

export class MirisStreamAsset {
  constructor(
    readonly assetUuid: string,
    readonly viewerKey?: string
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
  | SphereGeometryAsset
  | MirisStreamAsset;

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
  uuid?: string;
  name: string;
  asset?: MeshAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  visible: boolean;
  children?: Array<FoSceneNode> | null;
};

export type FoScene = Omit<FoSceneNode, "name" | "visible"> & {
  background: FiftyoneSceneRawJson["background"];
  cameraProps: FiftyoneSceneRawJson["camera"];
  lights: FiftyoneSceneRawJson["lights"];
  children?: Array<FoSceneNode> | null;
};
