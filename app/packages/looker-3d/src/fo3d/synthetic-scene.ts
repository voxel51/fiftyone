import type { ModalSample } from "@fiftyone/state";
import {
  getSamplePathExtension,
  isWrappableDirect3dSamplePath,
} from "@fiftyone/utilities";
import type { FiftyoneSceneRawJson, FoSceneRawNode } from "../utils";
import { getMediaPathForFo3dSample } from "./utils";

type SliceToSampleMap = Record<string, ModalSample>;

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

const DEFAULT_SCENE_BACKGROUND: FiftyoneSceneRawJson["background"] = {
  color: null,
  image: null,
  cube: null,
  intensity: 1,
};

/**
 * Returns the synthetic FO3D node metadata for a supported direct-3D file.
 */
const getNodeConfigForExtension = (extension: string | null) => {
  switch (extension) {
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
}: {
  sample: ModalSample;
  slice: string;
  mediaField: string;
}): FiftyoneSceneRawJson | null => {
  const mediaPath =
    getMediaPathForFo3dSample(sample, mediaField) ?? sample.sample.filepath;
  const extension = getSamplePathExtension(mediaPath);
  const nodeConfig = getNodeConfigForExtension(extension);

  if (!nodeConfig || !isWrappableDirect3dSamplePath(mediaPath)) {
    return null;
  }

  const node = {
    _type: nodeConfig.nodeType,
    name: slice,
    defaultMaterial: nodeConfig.defaultMaterial,
    ...EMPTY_SCENE_NODE_PROPS,
  } as FiftyoneSceneRawJson;

  // Each loader expects the source path on a node-type-specific media field.
  node[nodeConfig.mediaFieldName] = mediaPath;

  return node;
};

/**
 * Synthesizes a scene for direct-3D samples so they can render through the
 * standard FO3D scene pipeline.
 */
export const buildSyntheticSceneForDirect3dSamples = ({
  sample,
  mediaField,
  sampleMap,
}: {
  sample: ModalSample;
  mediaField: string;
  sampleMap?: SliceToSampleMap;
}): FiftyoneSceneRawJson | null => {
  const sceneSamples =
    sampleMap && Object.keys(sampleMap).length > 0
      ? sampleMap
      : { default: sample };

  const children = Object.entries(sceneSamples)
    .map(([slice, currentSample]) =>
      buildSyntheticNode({
        sample: currentSample,
        slice,
        mediaField,
      })
    )
    .filter((node): node is FiftyoneSceneRawJson => Boolean(node));

  if (!children.length) {
    return null;
  }

  // glTF/FBX assets are usually authored in Y-up, while the rest of the scene defaults to Z-up.
  const defaultUpAxis = children.every((child) =>
    Y_UP_NODE_TYPES.has(child._type)
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
