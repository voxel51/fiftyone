import { ModalSample, getSampleSrc } from "@fiftyone/state";
import { FoSceneGraph, FoSceneNode } from "../hooks";

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

export const getVisibilityMapFromFo3dParsed = (
  foSceneGraph: FoSceneGraph
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
