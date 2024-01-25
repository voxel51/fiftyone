import { getSampleSrc } from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useMemo, useState } from "react";
import { Quaternion, Vector3 } from "three";
import { FiftyoneSceneRawJson } from "../utils";

export interface ThreeDAsset {
  name: string;
  visible: boolean;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

export interface GltfReturnType extends ThreeDAsset {
  gltfUrl?: string;
}

export interface ObjReturnType extends ThreeDAsset {
  objUrl?: string;
  mtlUrl?: string;
}

export interface PcdReturnType extends ThreeDAsset {
  pcdUrl?: string;
}

export interface PlyReturnType extends ThreeDAsset {
  plyUrl?: string;
}

export interface StlReturnType extends ThreeDAsset {
  stlUrl?: string;
}

type MeshReturnType =
  | ObjReturnType
  | GltfReturnType
  | PcdReturnType
  | PlyReturnType
  | StlReturnType;

export type Fo3dData = {
  objs: ObjReturnType[];
  gltfs: GltfReturnType[];
  stls: StlReturnType[];
  pcds: PcdReturnType[];
  plys: PlyReturnType[];
};

type UseFo3dReturnType = {
  data: Fo3dData | null;
  isLoading: boolean;
};

/**
 * This hook parses the fo3d file.
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

  const transformedData = useMemo(() => {
    if (!rawData) {
      return {
        gltfs: [],
        objs: [],
        pcds: [],
        plys: [],
        stls: [],
      };
    }

    const objs: ObjReturnType[] = [];
    const gltfs: GltfReturnType[] = [];
    const stls: StlReturnType[] = [];
    const pcds: PcdReturnType[] = [];
    const plys: PlyReturnType[] = [];

    // do a depth first search of the scene
    const stack = [rawData];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      const currentObj: ThreeDAsset = {
        name: current.name,
        visible: current.visible,
        position: new Vector3(
          current.position[0],
          current.position[1],
          current.position[2]
        ),
        quaternion: new Quaternion(
          current.quaternion[0],
          current.quaternion[1],
          current.quaternion[2],
          current.quaternion[3]
        ),
        scale: new Vector3(
          current.scale[0],
          current.scale[1],
          current.scale[2]
        ),
      };

      if (current["_cls"].toLocaleLowerCase().endsWith("mesh")) {
        if (current["_cls"].toLocaleLowerCase().startsWith("gltf")) {
          if (current["gltf_path"]) {
            (currentObj as GltfReturnType).gltfUrl = getSampleSrc(
              current["gltf_path"]
            );
          }
          gltfs.push(currentObj);
        } else if (current["_cls"].toLocaleLowerCase().startsWith("obj")) {
          if (current["obj_path"]) {
            (currentObj as ObjReturnType).objUrl = getSampleSrc(
              current["obj_path"]
            );
          }

          if (current["mtl_path"]) {
            (currentObj as ObjReturnType).mtlUrl = getSampleSrc(
              current["mtl_path"]
            );
          }

          objs.push(currentObj);
        } else if (current["_cls"].toLocaleLowerCase().startsWith("stl")) {
          if (current["stl_path"]) {
            (currentObj as StlReturnType).stlUrl = getSampleSrc(
              current["stl_path"]
            );
          }
          stls.push(currentObj);
        } else if (current["_cls"].toLocaleLowerCase().startsWith("ply")) {
          if (current["ply_path"]) {
            (currentObj as PlyReturnType).plyUrl = getSampleSrc(
              current["ply_path"]
            );
          }
          plys.push(currentObj);
        }
      } else if (current["_cls"].endsWith("Pointcloud")) {
        if (current["pcd_path"]) {
          (currentObj as PcdReturnType).pcdUrl = getSampleSrc(
            current["pcd_path"]
          );
        }

        pcds.push(currentObj);
      }

      stack.push(...current.children);
    }

    return {
      objs,
      gltfs,
      stls,
      pcds,
      plys,
    };
  }, [rawData]);

  if (isLoading) {
    return {
      data: null,
      isLoading,
    };
  }

  return {
    isLoading: false,
    data: transformedData,
  } as UseFo3dReturnType;
};
