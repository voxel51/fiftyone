import { ModalSample, getSampleSrc } from "@fiftyone/state";
import { Fo3dData } from "../hooks";

export const getVisibilityMapFromFo3dParsed = (fo3dParsed: Fo3dData) => {
  if (!fo3dParsed) return null;

  const { gltfs, objs, stls, pcds, plys } = fo3dParsed;

  const visibilityMap = {};

  for (const gltf of gltfs) {
    const key =
      gltf.name.length > 0 ? gltf.name : gltf.gltfUrl.split("/").pop();
    visibilityMap[key] = true;
  }

  for (const obj of objs) {
    const key = obj.name.length > 0 ? obj.name : obj.objUrl.split("/").pop();
    visibilityMap[key] = true;
  }

  for (const stl of stls) {
    const key = stl.name.length > 0 ? stl.name : stl.stlUrl.split("/").pop();
    visibilityMap[key] = true;
  }

  for (const pcd of pcds) {
    const key = pcd.name.length > 0 ? pcd.name : pcd.pcdUrl.split("/").pop();
    visibilityMap[key] = true;
  }

  for (const ply of plys) {
    const key = ply.name.length > 0 ? ply.name : ply.plyUrl.split("/").pop();
    visibilityMap[key] = true;
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
