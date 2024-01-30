import { ModalSample, getSampleSrc } from "@fiftyone/state";
import { Fo3dData, ThreeDAsset } from "../hooks";

export const getIdentifierForAsset = (asset: ThreeDAsset): string => {
  const assetUrlProperty = Object.keys(asset).find((key) =>
    key.endsWith("Url")
  );

  if (!assetUrlProperty) {
    return asset.name ?? `unknown-${asset.constructor.name}`;
  }

  return asset.name.length > 0
    ? asset.name
    : asset[assetUrlProperty].split("/").pop();
};

export const getVisibilityMapFromFo3dParsed = (
  fo3dParsed: Fo3dData["assets"]
): Record<string, boolean> => {
  if (!fo3dParsed) return null;

  const { gltfs, objs, stls, pcds, plys } = fo3dParsed;

  const visibilityMap = {};

  for (const gltf of gltfs) {
    visibilityMap[getIdentifierForAsset(gltf)] = true;
  }

  for (const obj of objs) {
    visibilityMap[getIdentifierForAsset(obj)] = true;
  }

  for (const stl of stls) {
    visibilityMap[getIdentifierForAsset(stl)] = true;
  }

  for (const pcd of pcds) {
    visibilityMap[getIdentifierForAsset(pcd)] = true;
  }

  for (const ply of plys) {
    visibilityMap[getIdentifierForAsset(ply)] = true;
  }

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
