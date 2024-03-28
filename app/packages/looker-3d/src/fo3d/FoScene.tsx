import { useControls } from "leva";
import { useEffect, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { ACTION_TOGGLE_BACKGROUND, PANEL_ORDER_VISIBILITY } from "../constants";
import {
  BoxGeometryAsset,
  CylinderGeometryAsset,
  FbxAsset,
  FoScene,
  FoSceneNode,
  GltfAsset,
  ObjAsset,
  PcdAsset,
  PlaneGeometryAsset,
  PlyAsset,
  SphereGeometryAsset,
  StlAsset,
} from "../hooks";
import { actionRenderListAtomFamily, isFo3dBackgroundOnAtom } from "../state";
import { AssetErrorBoundary } from "./AssetErrorBoundary";
import { Fo3dBackground } from "./Background";
import { Stl } from "./Stl";
import { useFo3dContext } from "./context";
import { Fbx } from "./mesh/Fbx";
import { Gltf } from "./mesh/Gltf";
import { Obj } from "./mesh/Obj";
import { Ply } from "./mesh/Ply";
import { Pcd } from "./point-cloud/Pcd";
import { Box } from "./shape/Box";
import { Cylinder } from "./shape/Cylinder";
import { Plane } from "./shape/Plane";
import { Sphere } from "./shape/Sphere";
import { getLabelForSceneNode, getVisibilityMapFromFo3dParsed } from "./utils";

interface FoSceneProps {
  scene: FoScene;
}

const getAssetForNode = (node: FoSceneNode, children: React.ReactNode) => {
  if (!node.asset) {
    return null;
  }

  const label = getLabelForSceneNode(node);

  let jsx: JSX.Element = null;
  const key = `${label}-${node.position.x}-${node.position.y}-${node.position.z}`;

  if (node.asset instanceof ObjAsset) {
    jsx = (
      <Obj
        key={key}
        name={node.name}
        obj={node.asset as ObjAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Obj>
    );
  } else if (node.asset instanceof PcdAsset) {
    jsx = (
      <Pcd
        key={key}
        name={node.name}
        pcd={node.asset as PcdAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Pcd>
    );
  } else if (node.asset instanceof PlyAsset) {
    jsx = (
      <Ply
        key={key}
        name={node.name}
        ply={node.asset as PlyAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Ply>
    );
  } else if (node.asset instanceof StlAsset) {
    jsx = (
      <Stl
        key={key}
        name={node.name}
        stl={node.asset as StlAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Stl>
    );
  } else if (node.asset instanceof GltfAsset) {
    jsx = (
      <Gltf
        key={key}
        name={node.name}
        gltf={node.asset as GltfAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Gltf>
    );
  } else if (node.asset instanceof FbxAsset) {
    jsx = (
      <Fbx
        key={key}
        name={node.name}
        fbx={node.asset as FbxAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Fbx>
    );
  } else if (node.asset instanceof BoxGeometryAsset) {
    jsx = (
      <Box
        key={key}
        name={node.name}
        box={node.asset as BoxGeometryAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Box>
    );
  } else if (node.asset instanceof CylinderGeometryAsset) {
    jsx = (
      <Cylinder
        key={key}
        name={node.name}
        cylinder={node.asset as CylinderGeometryAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Cylinder>
    );
  } else if (node.asset instanceof SphereGeometryAsset) {
    jsx = (
      <Sphere
        key={key}
        name={node.name}
        sphere={node.asset as SphereGeometryAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Sphere>
    );
  } else if (node.asset instanceof PlaneGeometryAsset) {
    jsx = (
      <Plane
        key={key}
        name={node.name}
        plane={node.asset as PlaneGeometryAsset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
      >
        {children}
      </Plane>
    );
  }

  if (!jsx) {
    return null;
  }

  return <AssetErrorBoundary>{jsx}</AssetErrorBoundary>;
};

const R3fNode = ({
  node,
  visibilityMap,
}: {
  node: FoSceneNode;
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
}) => {
  const children = useMemo(() => {
    if (!node.children || node.children.length === 0) {
      return null;
    }

    return node.children.map((child) => {
      return (
        <R3fNode key={child.name} node={child} visibilityMap={visibilityMap} />
      );
    });
  }, [node, visibilityMap]);

  const label = useMemo(() => getLabelForSceneNode(node), [node]);

  const isNodeVisible = useMemo(
    () => Boolean(visibilityMap[label]),
    [label, visibilityMap]
  );

  const memoizedAsset = useMemo(
    () => (isNodeVisible ? getAssetForNode(node, children) : null),
    [node, children, isNodeVisible]
  );

  return memoizedAsset;
};

const SceneR3f = ({
  scene,
  visibilityMap,
}: {
  scene: FoScene;
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
}) => {
  return (
    <group
      position={scene.position}
      quaternion={scene.quaternion}
      scale={scene.scale}
    >
      {scene.children.map((child) => (
        <R3fNode key={child.name} node={child} visibilityMap={visibilityMap} />
      ))}
    </group>
  );
};

export const FoSceneComponent = ({ scene }: FoSceneProps) => {
  const defaultVisibilityMap = useMemo(
    () => getVisibilityMapFromFo3dParsed(scene),
    [scene]
  );

  const { isSceneInitialized } = useFo3dContext();

  const visibilityMap = useControls(
    "Visibility",
    defaultVisibilityMap ?? {},
    { order: PANEL_ORDER_VISIBILITY },
    [defaultVisibilityMap]
  );

  const setActionBarItems = useSetRecoilState(
    actionRenderListAtomFamily("fo3d")
  );

  const isFo3dBackgroundOn = useRecoilValue(isFo3dBackgroundOnAtom);

  useEffect(() => {
    if (isSceneInitialized && scene?.background !== null) {
      setActionBarItems((items) => [
        [ACTION_TOGGLE_BACKGROUND, null],
        ...items,
      ]);
    }
  }, [scene, isSceneInitialized, setActionBarItems]);

  return (
    <>
      {isFo3dBackgroundOn && scene.background && (
        <Fo3dBackground background={scene.background} />
      )}
      <SceneR3f scene={scene} visibilityMap={visibilityMap} />
    </>
  );
};
