import { ModalSample } from "@fiftyone/state";
import { PathType, determinePathType } from "@fiftyone/utilities";
import { folder } from "leva";
import {
  DoubleSide,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  PointsMaterial,
  Vector3,
  Vector3Tuple,
} from "three";
import {
  FoMeshBasicMaterialProps,
  FoMeshLambertMaterialProps,
  FoMeshPhongMaterialProps,
  FoScene,
  FoSceneNode,
} from "../hooks";

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

  const getVisibilityMapForChild = (child: FoSceneNode, isNested: boolean) => {
    if (child.children?.length > 0) {
      const folderName =
        child.name.charAt(0).toUpperCase() + child.name.slice(1);

      const childrenVisibilityMap = child.children.map((child) =>
        getVisibilityMapForChild(child, true)
      );

      return {
        [folderName]: folder({
          [child.name]: {
            value: child.visible,
            label: child.name,
          },
          ...childrenVisibilityMap.reduce(
            (acc, curr) => ({ ...acc, ...curr }),
            {}
          ),
        }),
      };
    }

    return {
      [child.name]: child.visible,
    };
  };

  return foSceneGraph.children
    .map((child) => getVisibilityMapForChild(child, false))
    .reduce((acc, curr) => ({ ...acc, ...curr }), {});
};

export const getMediaPathForFo3dSample = (
  sample: ModalSample,
  mediaField: string
) => {
  let mediaPath: string;

  if (Array.isArray(sample.urls)) {
    const mediaFieldObj = sample.urls.find((url) => url.field === mediaField);
    mediaPath = mediaFieldObj?.url ?? sample.urls[0].url;
  } else {
    mediaPath = sample.urls[mediaField];
  }

  return mediaPath;
};

export const getFo3dRoot = (fo3dPath: string) => {
  // remove filename and the last slash to get the root
  const root = fo3dPath.replace(/\/[^/]*\.fo3d$/, "/");

  return root;
};

export const getResolvedUrlForFo3dAsset = (
  assetUrl: string,
  fo3dRoot: string
) => {
  if (
    assetUrl.startsWith("s3://") ||
    assetUrl.startsWith("gcp://") ||
    assetUrl.startsWith("http://") ||
    assetUrl.startsWith("https://") ||
    assetUrl.startsWith("/") ||
    assetUrl.startsWith("data:")
  ) {
    return assetUrl;
  }

  return fo3dRoot + assetUrl;
};

export const getThreeMaterialFromFo3dMaterial = (
  foMtl: Record<string, number | string | boolean>
) => {
  const { _type, ...props } = foMtl;
  props["transparent"] = (props.opacity as number) < 1;
  props["side"] = DoubleSide;

  if (foMtl._type === "MeshBasicMaterial") {
    return new MeshBasicMaterial(props as FoMeshBasicMaterialProps);
  } else if (foMtl._type === "MeshStandardMaterial") {
    const { emissiveColor: standardEmissiveColor, ...standardProps } =
      props as FoMeshLambertMaterialProps;
    return new MeshStandardMaterial({
      ...standardProps,
      emissive: standardEmissiveColor,
    });
  } else if (foMtl._type === "MeshLambertMaterial") {
    const { emissiveColor: lambertEmissiveColor, ...lambertProps } =
      props as FoMeshLambertMaterialProps;
    return new MeshLambertMaterial({
      ...lambertProps,
      emissive: lambertEmissiveColor,
    });
  } else if (foMtl._type === "MeshPhongMaterial") {
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
  } else if (foMtl._type === "MeshDepthMaterial") {
    return new MeshDepthMaterial(props);
  } else if (foMtl._type === "PointCloudMaterial") {
    return new PointsMaterial(props);
  } else {
    throw new Error("Unknown material " + JSON.stringify(foMtl, null, 2));
  }
};

export const getOrthonormalAxis = (vec: Vector3Tuple | Vector3) => {
  if (!vec?.length) {
    return null;
  }

  if (vec instanceof Vector3) {
    vec = vec.toArray();
  }

  if (vec[0] === 1 && vec[1] === 0 && vec[2] === 0) {
    return "X";
  }

  if (vec[0] === 0 && vec[1] === 1 && vec[2] === 0) {
    return "Y";
  }

  if (vec[0] === 0 && vec[1] === 0 && vec[2] === 1) {
    return "Z";
  }

  return null;
};

export const getBasePathForTextures = (
  fo3dRoot: string,
  primaryAssetUrl: string
) => {
  const assetUrlDecoded = new URL(decodeURIComponent(primaryAssetUrl));
  const assetUrlSearchParams = assetUrlDecoded.searchParams;

  const fo3dRootPathType = determinePathType(fo3dRoot);

  if (
    fo3dRootPathType !== PathType.URL &&
    assetUrlSearchParams.has("filepath")
  ) {
    const assetFilePath = assetUrlSearchParams.get("filepath");
    const assetFilePathWithFilenameStripped = assetFilePath.replace(
      /[^/]*$/,
      ""
    );

    return `${assetUrlDecoded.origin}${assetUrlDecoded.pathname}?filepath=${assetFilePathWithFilenameStripped}`;
  }
};
