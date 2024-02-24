import { ModalSample, getSampleSrc } from "@fiftyone/state";
import {
  FoMaterial3D,
  FoMeshBasicMaterialProps,
  FoMeshLambertMaterialProps,
  FoMeshMaterial,
  FoMeshPhongMaterialProps,
  FoPointcloudMaterialProps,
  FoScene,
  FoSceneNode,
} from "../hooks";
import {
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshDepthMaterial,
  PointsMaterial,
} from "three";

export const getAssetUrlForSceneNode = (node: FoSceneNode): string => {
  if (!node.asset) return null;

  const assetUrlProperty = Object.keys(node.asset ?? []).find((key) =>
    key.endsWith("Url")
  );

  return node.asset[assetUrlProperty];
};

export const getLabelForSceneNode = (node: FoSceneNode): string => {
  if (node.name?.length > 0) {
    return node.name;
  }

  const assetUrl = getAssetUrlForSceneNode(node);

  if (!assetUrl) {
    return `unknown-${node.asset.constructor.name}`;
  }

  // return the filename without the extension
  return assetUrl.split("/").pop().split(".")[0];
};

export const getNodeFromSceneByName = (scene: FoScene, name: string) => {
  const visitNodeDfs = (node: FoSceneNode): FoSceneNode => {
    if (node.name === name) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const result = visitNodeDfs(child);
        if (result) return result;
      }
    }

    return null;
  };

  for (const child of scene.children) {
    const result = visitNodeDfs(child);
    if (result) return result;
  }

  return null;
};

export const getVisibilityMapFromFo3dParsed = (
  foSceneGraph: FoScene
): Record<string, boolean> => {
  if (!foSceneGraph) return null;

  const visibilityMap: Record<string, boolean> = {};

  // do a DFS of the scene graph and set visibility
  // todo: if node names are assumed to be not unique,
  // we should concatenate parents' names to the label to make it unique
  const visitNodeDfs = (node: FoSceneNode) => {
    const label = getLabelForSceneNode(node);
    visibilityMap[label] = node.visible;

    if (node.children) {
      for (const child of node.children) {
        visitNodeDfs(child);
      }
    }
  };

  foSceneGraph.children.forEach(visitNodeDfs);

  return visibilityMap;
};

export const getMediaUrlForFo3dSample = (
  sample: ModalSample,
  mediaField: string
) => {
  let mediaUrlUnresolved: string;

  if (Array.isArray(sample.urls)) {
    const mediaFieldObj = sample.urls.find((url) => url.field === mediaField);
    mediaUrlUnresolved = mediaFieldObj?.url ?? sample.urls[0].url;
  } else {
    mediaUrlUnresolved = sample.urls[mediaField];
  }

  return getSampleSrc(mediaUrlUnresolved);
};

export const getThreeMaterialFromFo3dMaterial = (
  foMtl: FoMeshMaterial | FoPointcloudMaterialProps
) => {
  const { _type, ...props } = foMtl;

  switch (foMtl._type) {
    case "MeshBasicMaterial":
      return new MeshBasicMaterial(props as FoMeshBasicMaterialProps);
    case "MeshLambertMaterial":
      const { emissiveColor: lambertEmissiveColor, ...lambertProps } =
        props as FoMeshLambertMaterialProps;
      return new MeshLambertMaterial({
        ...lambertProps,
        emissive: lambertEmissiveColor,
      });
    case "MeshPhongMaterial":
      const {
        emissiveColor: phongEmissiveColor,
        specularColor: phoneSpecularColor,
        ...phongProps
      } = props as FoMeshPhongMaterialProps;
      return new MeshPhongMaterial({
        specular: phoneSpecularColor,
        emissive: phongEmissiveColor,
        ...phongProps,
      });
    case "MeshDepthMaterial":
      return new MeshDepthMaterial(props);
    case "PointcloudMaterial":
      return new PointsMaterial(props);
    default:
      return null;
  }
};
