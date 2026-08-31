import type { ModalSample } from "@fiftyone/state";
import {
  GAUSSIAN_SPLAT_EXTENSIONS,
  getSamplePathExtension,
  isWrappableDirect3dSamplePath,
} from "@fiftyone/utilities";
import type { FiftyoneSceneRawJson, FoSceneRawNode } from "../utils";
import type { DirectPcdWorldTransforms } from "./direct-pcd-world-alignment";
import { DEFAULT_SPLAT_OPACITY, DEFAULT_SPLAT_TINT } from "./splat/settings";
import { getMediaPathForFo3dSample } from "./utils";

type SliceToSampleMap = Record<string, ModalSample>;
type Direct3dMediaFieldName =
  | "pcdPath"
  | "plyPath"
  | "gltfPath"
  | "fbxPath"
  | "stlPath"
  | "splatPath";
type SyntheticSceneNode = Omit<
  FiftyoneSceneRawJson,
  "background" | "camera" | "lights"
> &
  Partial<Record<Direct3dMediaFieldName, string>> & {
    format?: string;
    centerGeometry?: boolean;
    opacity?: number;
    tint?: string;
  };
type SyntheticNodeConfig = {
  nodeType: string;
  mediaFieldName: Direct3dMediaFieldName;
  defaultMaterial: FoSceneRawNode["defaultMaterial"];
  format?: string;
  centerGeometry?: boolean;
  opacity?: number;
  tint?: string;
};

const DEFAULT_MESH_MATERIAL: FoSceneRawNode["defaultMaterial"] = {
  _type: "MeshStandardMaterial",
  color: "#ffffff",
  emissiveColor: "#000000",
  emissiveIntensity: 0,
  metalness: 0,
  roughness: 1,
  opacity: 1,
  vertexColors: true,
  wireframe: false,
};

const DEFAULT_POINT_CLOUD_MATERIAL: FoSceneRawNode["defaultMaterial"] = {
  _type: "PointCloudMaterial",
  shadingMode: "rgb",
  customColor: "#ffffff",
  pointSize: 2,
  attenuateByDistance: false,
  opacity: 1,
  vertexColors: true,
};

const EMPTY_SCENE_NODE_PROPS = {
  visible: true,
  position: [0, 0, 0] as [number, number, number],
  quaternion: [0, 0, 0, 1] as [number, number, number, number],
  scale: [1, 1, 1] as [number, number, number],
  children: [] as FiftyoneSceneRawJson[],
};

const DEFAULT_SCENE_CAMERA: FiftyoneSceneRawJson["camera"] = {
  position: null,
  lookAt: null,
  up: "Z",
  fov: 50,
  aspect: 1,
  near: 0.1,
  far: 5000,
};

const Y_UP_NODE_TYPES = new Set(["GltfMesh", "FbxMesh"]);
const GAUSSIAN_SPLAT_EXTENSION_SET: ReadonlySet<string> = new Set(
  GAUSSIAN_SPLAT_EXTENSIONS,
);

const DEFAULT_SCENE_BACKGROUND: FiftyoneSceneRawJson["background"] = {
  color: null,
  image: null,
  cube: null,
  intensity: 1,
};

/**
 * Returns the synthetic FO3D node metadata for a supported direct-3D file.
 */
const getNodeConfigForExtension = (
  extension: string | null,
): SyntheticNodeConfig | null => {
  const normalizedExtension = extension?.toLowerCase() ?? null;

  if (
    normalizedExtension &&
    GAUSSIAN_SPLAT_EXTENSION_SET.has(normalizedExtension)
  ) {
    return {
      nodeType: "GaussianSplat",
      mediaFieldName: "splatPath",
      defaultMaterial: DEFAULT_MESH_MATERIAL,
      format: normalizedExtension.slice(1),
      centerGeometry: true,
      opacity: DEFAULT_SPLAT_OPACITY,
      tint: DEFAULT_SPLAT_TINT,
    };
  }

  switch (normalizedExtension) {
    case ".pcd":
      return {
        nodeType: "PointCloud",
        mediaFieldName: "pcdPath",
        defaultMaterial: DEFAULT_POINT_CLOUD_MATERIAL,
      };
    case ".ply":
      return {
        nodeType: "PlyMesh",
        mediaFieldName: "plyPath",
        defaultMaterial: DEFAULT_MESH_MATERIAL,
      };
    case ".gltf":
    case ".glb":
      return {
        nodeType: "GltfMesh",
        mediaFieldName: "gltfPath",
        defaultMaterial: DEFAULT_MESH_MATERIAL,
      };
    case ".fbx":
      return {
        nodeType: "FbxMesh",
        mediaFieldName: "fbxPath",
        defaultMaterial: DEFAULT_MESH_MATERIAL,
      };
    case ".stl":
      return {
        nodeType: "StlMesh",
        mediaFieldName: "stlPath",
        defaultMaterial: DEFAULT_MESH_MATERIAL,
      };
    default:
      return null;
  }
};

/**
 * Wraps a direct-3D sample in the minimal node structure expected by FO3D.
 */
const buildSyntheticNode = ({
  sample,
  slice,
  mediaField,
  worldTransformsBySlice,
}: {
  sample: ModalSample;
  slice: string;
  mediaField: string;
  worldTransformsBySlice?: DirectPcdWorldTransforms;
}): FiftyoneSceneRawJson | null => {
  const mediaPath =
    getMediaPathForFo3dSample(sample, mediaField) ?? sample.sample.filepath;
  const extension = getSamplePathExtension(mediaPath);
  const nodeConfig = getNodeConfigForExtension(extension);

  if (!nodeConfig || !isWrappableDirect3dSamplePath(mediaPath)) {
    return null;
  }

  const node: SyntheticSceneNode = {
    _type: nodeConfig.nodeType,
    name: slice,
    defaultMaterial: nodeConfig.defaultMaterial,
    ...EMPTY_SCENE_NODE_PROPS,
  };

  const worldTransform =
    nodeConfig.nodeType === "PointCloud"
      ? worldTransformsBySlice?.[slice]
      : undefined;
  if (worldTransform) {
    node.position = [...worldTransform.translation];
    node.quaternion = [...worldTransform.quaternion];
  }

  // Each loader expects the source path on a node-type-specific media field.
  node[nodeConfig.mediaFieldName] = mediaPath;
  if (nodeConfig.format) {
    node.format = nodeConfig.format;
  }
  if (nodeConfig.centerGeometry !== undefined) {
    node.centerGeometry = nodeConfig.centerGeometry;
  }
  if (nodeConfig.opacity !== undefined) {
    node.opacity = nodeConfig.opacity;
  }
  if (nodeConfig.tint !== undefined) {
    node.tint = nodeConfig.tint;
  }

  return node as FiftyoneSceneRawJson;
};

/**
 * Builds synthetic FO3D child nodes for each direct-3D sample in the slice map.
 */
export const buildSyntheticSceneNodesForDirect3dSamples = ({
  sample,
  mediaField,
  sampleMap,
  worldTransformsBySlice,
}: {
  sample: ModalSample;
  mediaField: string;
  sampleMap?: SliceToSampleMap;
  worldTransformsBySlice?: DirectPcdWorldTransforms;
}): FiftyoneSceneRawJson[] => {
  const sceneSamples =
    sampleMap && Object.keys(sampleMap).length > 0
      ? sampleMap
      : { default: sample };

  return Object.entries(sceneSamples)
    .map(([slice, currentSample]) =>
      buildSyntheticNode({
        sample: currentSample,
        slice,
        mediaField,
        worldTransformsBySlice,
      }),
    )
    .filter((node): node is FiftyoneSceneRawJson => Boolean(node));
};

/**
 * Synthesizes a scene for direct-3D samples so they can render through the
 * standard FO3D scene pipeline.
 */
export const buildSyntheticSceneForDirect3dSamples = ({
  sample,
  mediaField,
  sampleMap,
  worldTransformsBySlice,
}: {
  sample: ModalSample;
  mediaField: string;
  sampleMap?: SliceToSampleMap;
  worldTransformsBySlice?: DirectPcdWorldTransforms;
}): FiftyoneSceneRawJson | null => {
  const children = buildSyntheticSceneNodesForDirect3dSamples({
    sample,
    mediaField,
    sampleMap,
    worldTransformsBySlice,
  });

  if (!children.length) {
    return null;
  }

  // glTF/FBX assets are usually authored in Y-up, while the rest of the scene defaults to Z-up.
  const defaultUpAxis = children.every((child) =>
    Y_UP_NODE_TYPES.has(child._type),
  )
    ? "Y"
    : "Z";

  return {
    _type: "Scene",
    name: "root",
    defaultMaterial: DEFAULT_MESH_MATERIAL,
    ...EMPTY_SCENE_NODE_PROPS,
    camera: {
      ...DEFAULT_SCENE_CAMERA,
      up: defaultUpAxis,
    },
    background: DEFAULT_SCENE_BACKGROUND,
    lights: null,
    children,
  };
};
