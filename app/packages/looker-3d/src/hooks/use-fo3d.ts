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
  | StlReturnType
  | PlyReturnType;

type Fo3dData = {
  objs: ObjReturnType[];
  gltfs: GltfReturnType[];
  stls: StlReturnType[];
  plys: PlyReturnType[];
};

type UseFo3dReturnType = {
  data: Fo3dData | null;
  error: Error | null;
  isLoading: boolean;
};

const fetcher: Fetcher<FiftyoneSceneRawJson, string> = async (url: string) =>
  getFetchFunction()("GET", url);

/**
 * This hook parses the fo3d file.
 */
export const useFo3d = (url: string) => {
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
          if (current["gltf_url"]) {
            (meshObj as GltfReturnType).gltfUrl = current["gltf_url"];
          }
          gltfs.push(meshObj);
        } else if (current["_cls"].toLocaleLowerCase().startsWith("obj")) {
          if (current["obj_url"]) {
            (meshObj as ObjReturnType).objUrl = current["obj_url"];
          }

          if (current["mtl_url"]) {
            (meshObj as ObjReturnType).mtlUrl = current["mtl_url"];
          }

          objs.push(meshObj);
        } else if (current["_cls"].toLocaleLowerCase().startsWith("stl")) {
          if (current["stl_url"]) {
            (meshObj as StlReturnType).stlUrl = current["stl_url"];
          }
          stls.push(meshObj);
        } else if (current["_cls"].toLocaleLowerCase().startsWith("ply")) {
          if (current["ply_url"]) {
            (meshObj as PlyReturnType).plyUrl = current["ply_url"];
          }
          plys.push(meshObj);
        }
      } else if (current["_cls"].endsWith("Pointcloud")) {
        const pointcloud: PcdReturnType = {
          name: current.name,
          visible: current.visible,
        };

        if (current["pcd_url"]) {
          pointcloud.pcdUrl = current["pcd_url"];
        }

        objs.push(pointcloud);
      }

      stack.push(...current.children);
    }

    return {
      objs,
      gltfs,
      stls,
      plys,
    };
  }, [rawData]);

  if (error) {
    return {
      data: null,
      error,
      isLoading,
    };
  }

  if (isLoading) {
    return {
      data: null,
      error: null,
      isLoading,
    };
  }

  return {
    error: null,
    isLoading: false,
    data: transformedData,
  } as UseFo3dReturnType;
};
