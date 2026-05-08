import { Quaternion, Vector3 } from "three";
import {
  BoxGeometryAsset,
  CylinderGeometryAsset,
  FbxAsset,
  type FoMeshMaterial,
  type FoPointcloudMaterialProps,
  type FoScene,
  type FoSceneNode,
  GltfAsset,
  type MeshAsset,
  MirisStreamAsset,
  ObjAsset,
  PcdAsset,
  PlaneGeometryAsset,
  PlyAsset,
  SphereGeometryAsset,
  StlAsset,
} from "../fo3d/render-types";
import {
  type FiftyoneSceneRawJson,
  type FoSceneRawNode,
  isNumericTuple,
} from "../utils";

type NodeRecord = Record<string, unknown>;

type NodeWithStringFields<T extends string> = FoSceneRawNode &
  Record<T, string>;
type NodeWithNumberFields<T extends string> = FoSceneRawNode &
  Record<T, number>;

const FO_MESH_MATERIAL_TYPES = new Set<FoMeshMaterial["_type"]>([
  "MeshBasicMaterial",
  "MeshStandardMaterial",
  "MeshLambertMaterial",
  "MeshPhongMaterial",
  "MeshDepthMaterial",
]);

const hasStringField = <T extends string>(
  node: FoSceneRawNode,
  field: T
): node is NodeWithStringFields<T> => {
  return typeof (node as NodeRecord)[field] === "string";
};

const hasNumberFields = <T extends string>(
  node: FoSceneRawNode,
  fields: readonly T[]
): node is NodeWithNumberFields<T> => {
  return fields.every(
    (field) => typeof (node as NodeRecord)[field] === "number"
  );
};

const getOptionalStringField = (node: FoSceneRawNode, field: string) => {
  const value = (node as NodeRecord)[field];
  return typeof value === "string" ? value : undefined;
};

const getOptionalBooleanField = (node: FoSceneRawNode, field: string) => {
  const value = (node as NodeRecord)[field];
  return typeof value === "boolean" ? value : undefined;
};

const isFoPointcloudMaterial = (
  material: FoSceneRawNode["defaultMaterial"] | undefined
): material is FoPointcloudMaterialProps => {
  return material?._type === "PointCloudMaterial";
};

const isFoMeshMaterial = (
  material: FoSceneRawNode["defaultMaterial"] | undefined
): material is FoMeshMaterial => {
  return Boolean(
    material &&
      FO_MESH_MATERIAL_TYPES.has(material._type as FoMeshMaterial["_type"])
  );
};

const toVector3 = (
  value: unknown,
  fallback: [number, number, number] = [0, 0, 0]
) => {
  const vector = isNumericTuple(value, 3) ? value : fallback;
  return new Vector3(vector[0], vector[1], vector[2]);
};

const toQuaternion = (
  value: unknown,
  fallback: [number, number, number, number] = [0, 0, 0, 1]
) => {
  const quaternion = isNumericTuple(value, 4) ? value : fallback;
  return new Quaternion(
    quaternion[0],
    quaternion[1],
    quaternion[2],
    quaternion[3]
  );
};

const parseAsset = (node: FoSceneRawNode): MeshAsset | undefined => {
  const nodeType = node._type.toLowerCase();
  const material = node.defaultMaterial;

  if (nodeType === "mirisstream" && hasStringField(node, "assetUuid")) {
    return new MirisStreamAsset(
      node.assetUuid,
      getOptionalStringField(node, "viewerKey")
    );
  }

  if (nodeType.endsWith("mesh")) {
    const meshMaterial = isFoMeshMaterial(material) ? material : undefined;

    if (nodeType.startsWith("fbx") && hasStringField(node, "fbxPath")) {
      return new FbxAsset(
        node.fbxPath,
        getOptionalStringField(node, "preTransformedFbxPath"),
        meshMaterial
      );
    }

    if (nodeType.startsWith("gltf") && hasStringField(node, "gltfPath")) {
      return new GltfAsset(
        node.gltfPath,
        getOptionalStringField(node, "preTransformedGltfPath"),
        meshMaterial
      );
    }

    if (nodeType.startsWith("obj") && hasStringField(node, "objPath")) {
      return new ObjAsset(
        node.objPath,
        getOptionalStringField(node, "mtlPath"),
        getOptionalStringField(node, "preTransformedObjPath"),
        getOptionalStringField(node, "preTransformedMtlPath"),
        meshMaterial
      );
    }

    if (nodeType.startsWith("stl") && hasStringField(node, "stlPath")) {
      return new StlAsset(
        node.stlPath,
        getOptionalStringField(node, "preTransformedStlPath"),
        meshMaterial
      );
    }

    if (nodeType.startsWith("ply") && hasStringField(node, "plyPath")) {
      return new PlyAsset(
        node.plyPath,
        getOptionalStringField(node, "preTransformedPlyPath"),
        meshMaterial,
        getOptionalBooleanField(node, "isPointCloud"),
        getOptionalBooleanField(node, "centerGeometry") ?? true
      );
    }
  }

  if (nodeType.endsWith("pointcloud") && hasStringField(node, "pcdPath")) {
    return new PcdAsset(
      node.pcdPath,
      getOptionalStringField(node, "preTransformedPcdPath"),
      isFoPointcloudMaterial(material) ? material : undefined,
      getOptionalBooleanField(node, "centerGeometry") ?? false
    );
  }

  if (nodeType.endsWith("geometry")) {
    const meshMaterial = isFoMeshMaterial(material) ? material : undefined;

    if (
      nodeType.startsWith("box") &&
      hasNumberFields(node, ["width", "height", "depth"])
    ) {
      return new BoxGeometryAsset(
        node.width,
        node.height,
        node.depth,
        meshMaterial
      );
    }

    if (
      nodeType.startsWith("cylinder") &&
      hasNumberFields(node, [
        "radiusTop",
        "radiusBottom",
        "height",
        "radialSegments",
        "heightSegments",
        "thetaStart",
        "thetaLength",
      ])
    ) {
      return new CylinderGeometryAsset(
        node.radiusTop,
        node.radiusBottom,
        node.height,
        node.radialSegments,
        node.heightSegments,
        getOptionalBooleanField(node, "openEnded") ?? false,
        node.thetaStart,
        node.thetaLength,
        meshMaterial
      );
    }

    if (
      nodeType.endsWith("planegeometry") &&
      hasNumberFields(node, ["width", "height"])
    ) {
      return new PlaneGeometryAsset(node.width, node.height, meshMaterial);
    }

    if (
      nodeType.endsWith("spheregeometry") &&
      hasNumberFields(node, [
        "radius",
        "widthSegments",
        "heightSegments",
        "phiStart",
        "phiLength",
        "thetaStart",
        "thetaLength",
      ])
    ) {
      return new SphereGeometryAsset(
        node.radius,
        node.widthSegments,
        node.heightSegments,
        node.phiStart,
        node.phiLength,
        node.thetaStart,
        node.thetaLength,
        meshMaterial
      );
    }
  }

  return undefined;
};

const buildSceneNode = (node: FoSceneRawNode): FoSceneNode => {
  return {
    uuid: node.uuid,
    asset: parseAsset(node),
    name: node.name,
    visible: node.visible,
    position: toVector3(node.position),
    quaternion: toQuaternion(node.quaternion),
    scale: toVector3(node.scale, [1, 1, 1]),
    children:
      Array.isArray(node.children) && node.children.length
        ? node.children.map(buildSceneNode)
        : null,
  };
};

export const buildFoScene = (rawData: FiftyoneSceneRawJson): FoScene => {
  return {
    cameraProps: rawData.camera,
    lights: rawData.lights,
    background: rawData.background,
    position: toVector3(rawData.position),
    quaternion: toQuaternion(rawData.quaternion),
    scale: toVector3(rawData.scale, [1, 1, 1]),
    children: Array.isArray(rawData.children)
      ? rawData.children.map(buildSceneNode)
      : null,
  };
};

export const getRootAssetCount = (scene: FoScene | null): number => {
  return scene?.children?.length ?? 0;
};
