import { useControls } from "leva";
import { useMemo } from "react";
import {
  FoSceneGraph,
  FoSceneNode,
  ObjAsset,
  PcdAsset,
  PlyAsset,
  StlAsset,
} from "../hooks";
import { AssetErrorBoundary } from "./AssetErrorBoundary";
import { Obj } from "./Obj";
import { Pcd } from "./Pcd";
import { Ply } from "./Ply";
import { Stl } from "./Stl";
import { getLabelForSceneNode, getVisibilityMapFromFo3dParsed } from "./utils";

interface FoSceneProps {
  scene: FoSceneGraph;
}

const getAssetForNode = (node: FoSceneNode) => {
  if (!node.asset) {
    return null;
  }

  const label = getLabelForSceneNode(node);

  if (node.asset instanceof ObjAsset) {
    return (
      <Obj
        key={`${label}-${node.position.x}-${node.position.y}-${node.position.z}`}
        obj={node.asset as ObjAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      />
    );
  } else if (node.asset instanceof PcdAsset) {
    return (
      <Pcd
        key={`${label}-${node.position.x}-${node.position.y}-${node.position.z}`}
        pcd={node.asset as PcdAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      />
    );
  } else if (node.asset instanceof PlyAsset) {
    return (
      <Ply
        key={`${label}-${node.position.x}-${node.position.y}-${node.position.z}`}
        ply={node.asset as PlyAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      />
    );
  } else if (node.asset instanceof StlAsset) {
    return (
      <Stl
        key={`${label}-${node.position.x}-${node.position.y}-${node.position.z}`}
        stl={node.asset as StlAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      />
    );
  }

  return null;
};

const getR3fNodeFromFo3dNode = (
  node: FoSceneNode,
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>
) => {
  const label = getLabelForSceneNode(node);

  // todo: should we still "shadow render" asset when visibility is off?
  // check for perforamance trade-offs to see if this is the right way to handle visibility
  if (Boolean(visibilityMap[label]) === false) {
    return null;
  }

  const jsx = getAssetForNode(node);

  if (!node.children || node.children.length === 0) {
    return jsx ? (
      <AssetErrorBoundary key={jsx.key}>{jsx}</AssetErrorBoundary>
    ) : null;
  }

  return (
    <group
      key={`${label}-${node.position.x}-${node.position.y}-${node.position.z}`}
      position={node.position}
      quaternion={node.quaternion}
      scale={node.scale}
    >
      {jsx && <AssetErrorBoundary key={jsx.key}>{jsx}</AssetErrorBoundary>}
      {node.children.map((child) =>
        getR3fNodeFromFo3dNode(child, visibilityMap)
      )}
    </group>
  );
};

const getR3fSceneFromFo3dScene = (
  scene: FoSceneGraph,
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>
) => {
  return (
    <group
      position={scene.position}
      quaternion={scene.quaternion}
      scale={scene.scale}
    >
      {scene.children.map((child) => {
        return getR3fNodeFromFo3dNode(child, visibilityMap);
      })}
    </group>
  );
};

export const FoScene = ({ scene }: FoSceneProps) => {
  const defaultVisibilityMap = useMemo(
    () => getVisibilityMapFromFo3dParsed(scene),
    [scene]
  );

  const visibilityMap = useControls("Visibility", defaultVisibilityMap ?? {}, [
    defaultVisibilityMap,
  ]);

  const sceneR3f = useMemo(() => {
    if (!scene) {
      return null;
    }

    const r3fScene = getR3fSceneFromFo3dScene(scene, visibilityMap);
    return r3fScene;
  }, [scene, visibilityMap]);

  return sceneR3f;
};
