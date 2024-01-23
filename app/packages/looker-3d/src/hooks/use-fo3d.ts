import { getSampleSrc } from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useMemo } from "react";
import useSWR, { Fetcher } from "swr";
import { FiftyoneSceneRawJson } from "../utils";

interface ThreeDAsset {
  name: string;
  visible: boolean;
}

interface GltfReturnType extends ThreeDAsset {
  gltfUrl?: string;
}

interface ObjReturnType extends ThreeDAsset {
  objUrl?: string;
  mtlUrl?: string;
}

interface PcdReturnType extends ThreeDAsset {
  pcdUrl?: string;
}

interface PlyReturnType extends ThreeDAsset {
  plyUrl?: string;
}

interface StlReturnType extends ThreeDAsset {
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

const fetcher: Fetcher<FiftyoneSceneRawJson, string> = async (url: string) =>
  getFetchFunction()("GET", url);

/**
 * This hook parses the fo3d file.
 */
export const useFo3d = (url: string): UseFo3dReturnType => {
  const { data: rawData, error, isLoading } = useSWR(url, fetcher);

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

      if (current["_cls"].toLocaleLowerCase().endsWith("mesh")) {
        const meshObj: MeshReturnType = {
          name: current.name,
          visible: current.visible,
        };

        if (current["_cls"].toLocaleLowerCase().startsWith("gltf")) {
          if (current["gltf_path"]) {
            (meshObj as GltfReturnType).gltfUrl = getSampleSrc(
              current["gltf_path"]
            );
          }
          gltfs.push(meshObj);
        } else if (current["_cls"].toLocaleLowerCase().startsWith("obj")) {
          if (current["obj_path"]) {
            (meshObj as ObjReturnType).objUrl = getSampleSrc(
              current["obj_path"]
            );
          }

          if (current["mtl_path"]) {
            (meshObj as ObjReturnType).mtlUrl = getSampleSrc(
              current["mtl_path"]
            );
          }

          objs.push(meshObj);
        } else if (current["_cls"].toLocaleLowerCase().startsWith("stl")) {
          if (current["stl_path"]) {
            (meshObj as StlReturnType).stlUrl = getSampleSrc(
              current["stl_path"]
            );
          }
          stls.push(meshObj);
        } else if (current["_cls"].toLocaleLowerCase().startsWith("ply")) {
          if (current["ply_path"]) {
            (meshObj as PlyReturnType).plyUrl = getSampleSrc(
              current["ply_path"]
            );
          }
          plys.push(meshObj);
        }
      } else if (current["_cls"].endsWith("Pointcloud")) {
        const pointcloud: PcdReturnType = {
          name: current.name,
          visible: current.visible,
        };

        if (current["pcd_path"]) {
          pointcloud.pcdUrl = getSampleSrc(current["pcd_path"]);
        }

        pcds.push(pointcloud);
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

  if (error) {
    throw new Error(JSON.stringify(error));
  }

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
