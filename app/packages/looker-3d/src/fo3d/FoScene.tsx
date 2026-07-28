import { useControls } from "leva";
import {
  createContext,
  memo,
  Suspense,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { Fo3dErrorBoundary } from "../ErrorBoundary";
import { PANEL_ORDER_VISIBILITY } from "../constants";
import { useUrlModifier } from "../hooks/use-fo3d-fetcher";
import { fo3dContainsBackground, isFo3dBackgroundOnAtom } from "../state";
import type { PointCloudCrop } from "../utils/point-cloud-crop";
import { AssetErrorBoundary } from "./AssetErrorBoundary";
import { Fo3dBackground } from "./Background";
import { useFo3dContext } from "./context";
import { Fbx } from "./mesh/Fbx";
import { Gltf } from "./mesh/Gltf";
import { Obj } from "./mesh/Obj";
import { Ply } from "./mesh/Ply";
import { Stl } from "./mesh/Stl";
import { Pcd } from "./point-cloud/Pcd";
import {
  BoxGeometryAsset,
  CylinderGeometryAsset,
  FbxAsset,
  GaussianSplatAsset,
  type FoScene,
  type FoSceneNode,
  GltfAsset,
  ObjAsset,
  PcdAsset,
  PlaneGeometryAsset,
  PlyAsset,
  SphereGeometryAsset,
  StlAsset,
} from "./render-types";
import { Box } from "./shape/Box";
import { Cylinder } from "./shape/Cylinder";
import { Plane } from "./shape/Plane";
import { Sphere } from "./shape/Sphere";
import {
  GaussianSplat,
  requiresCovarianceSplatTransform,
} from "./splat/GaussianSplat";
import { SparkRendererProvider } from "./splat/SparkRendererRoot";
import { getLabelForSceneNode, getVisibilityMapFromFo3dParsed } from "./utils";

interface FoSceneProps {
  scene: FoScene;
  pointCloudCrop?: PointCloudCrop | null;
}

const PointCloudCropContext = createContext<PointCloudCrop | null | undefined>(
  null,
);

const PcdAssetNode = ({
  children,
  node,
  nodeKey,
}: {
  children: React.ReactNode;
  node: FoSceneNode & { asset: PcdAsset };
  nodeKey: string;
}) => {
  const pointCloudCrop = useContext(PointCloudCropContext);

  return (
    <Pcd
      key={nodeKey}
      name={node.name}
      pcd={node.asset}
      position={node.position}
      quaternion={node.quaternion}
      scale={node.scale}
      pointCloudCrop={pointCloudCrop}
    >
      {children}
    </Pcd>
  );
};

const PlyAssetNode = ({
  children,
  node,
  nodeKey,
  requiresCovariance,
}: {
  children: React.ReactNode;
  node: FoSceneNode & { asset: PlyAsset };
  nodeKey: string;
  requiresCovariance: boolean;
}) => {
  const pointCloudCrop = useContext(PointCloudCropContext);

  return (
    <Ply
      key={nodeKey}
      name={node.name}
      ply={node.asset}
      position={node.position}
      quaternion={node.quaternion}
      scale={node.scale}
      pointCloudCrop={pointCloudCrop}
      requiresCovariance={requiresCovariance}
    >
      {children}
    </Ply>
  );
};

const getAssetJsx = (
  node: FoSceneNode,
  children: React.ReactNode,
  requiresCovariance: boolean,
) => {
  if (!node.asset) {
    return null;
  }

  const label = getLabelForSceneNode(node);
  const key = `${label}-${node.position.x}-${node.position.y}-${node.position.z}`;

  if (node.asset instanceof ObjAsset) {
    return (
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
    return (
      <PcdAssetNode
        key={key}
        node={node as FoSceneNode & { asset: PcdAsset }}
        nodeKey={key}
      >
        {children}
      </PcdAssetNode>
    );
  } else if (node.asset instanceof PlyAsset) {
    return (
      <PlyAssetNode
        key={key}
        node={node as FoSceneNode & { asset: PlyAsset }}
        nodeKey={key}
        requiresCovariance={requiresCovariance}
      >
        {children}
      </PlyAssetNode>
    );
  } else if (node.asset instanceof GaussianSplatAsset) {
    return (
      <GaussianSplat
        key={key}
        name={node.name}
        splat={node.asset}
        position={node.position}
        quaternion={node.quaternion}
        scale={node.scale}
        requiresCovariance={requiresCovariance}
      >
        {children}
      </GaussianSplat>
    );
  } else if (node.asset instanceof StlAsset) {
    return (
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
    return (
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
    return (
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
    return (
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
    return (
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
    return (
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
    return (
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

  return null;
};

const getAssetErrorResetKey = (node: FoSceneNode, assetRoot: string | null) => {
  if (node.asset instanceof GaussianSplatAsset) {
    const source = node.asset.preTransformedSplatPath ?? node.asset.splatPath;
    return JSON.stringify([assetRoot ?? "", source, node.asset.format ?? ""]);
  }

  return node.asset;
};

const R3fNode = ({
  ancestorRequiresCovariance,
  assetRoot,
  node,
  visibilityMap,
}: {
  ancestorRequiresCovariance: boolean;
  assetRoot: string | null;
  node: FoSceneNode;
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
}) => {
  const requiresCovariance = requiresCovarianceSplatTransform(
    node.scale,
    ancestorRequiresCovariance,
  );
  const children = useMemo(() => {
    if (!node.children || node.children.length === 0) {
      return null;
    }

    return node.children.map((child) => {
      return (
        <R3fNode
          key={child.name}
          ancestorRequiresCovariance={requiresCovariance}
          assetRoot={assetRoot}
          node={child}
          visibilityMap={visibilityMap}
        />
      );
    });
  }, [assetRoot, node, requiresCovariance, visibilityMap]);

  const label = useMemo(() => getLabelForSceneNode(node), [node]);

  const isNodeVisible = useMemo(
    () => Boolean(visibilityMap[label]),
    [label, visibilityMap],
  );

  const assetJsx = useMemo(
    () =>
      isNodeVisible ? getAssetJsx(node, children, requiresCovariance) : null,
    [node, children, isNodeVisible, requiresCovariance],
  );
  const assetErrorResetKey = useMemo(
    () => getAssetErrorResetKey(node, assetRoot),
    [assetRoot, node],
  );

  if (!assetJsx) {
    return null;
  }

  return (
    <AssetErrorBoundary resetKey={assetErrorResetKey}>
      <Suspense fallback={null}>{assetJsx}</Suspense>
    </AssetErrorBoundary>
  );
};

const SceneR3fComponent = ({
  assetRoot,
  scene,
  visibilityMap,
}: {
  assetRoot: string | null;
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
        <R3fNode
          key={child.name}
          ancestorRequiresCovariance={requiresCovarianceSplatTransform(
            scene.scale,
          )}
          assetRoot={assetRoot}
          node={child}
          visibilityMap={visibilityMap}
        />
      ))}
    </group>
  );
};

const SceneR3f = memo(SceneR3fComponent);

/** Renders a parsed FO3D scene and its asset-specific controls. */
export const FoSceneComponent = ({ scene, pointCloudCrop }: FoSceneProps) => {
  const defaultVisibilityMap = useMemo(
    () => getVisibilityMapFromFo3dParsed(scene),
    [scene],
  );

  const { isSceneInitialized, fo3dRoot } = useFo3dContext();

  useUrlModifier(fo3dRoot);

  const visibilityMap = useControls(
    "Visibility",
    defaultVisibilityMap ?? {},
    {
      order: PANEL_ORDER_VISIBILITY,
      // note: if there's only one object in the scene, we don't need to show the visibility panel
      // instead, we can expand the panel of the "main object" by default
      // this saves an extra click for the user
      collapsed: Object.keys(defaultVisibilityMap).length < 2,
    },
    [defaultVisibilityMap],
  );

  const isFo3dBackgroundOn = useRecoilValue(isFo3dBackgroundOnAtom);

  const setFo3dContainsBackground = useSetRecoilState(fo3dContainsBackground);

  // This effect synchronizes background availability with the active scene.
  useEffect(() => {
    if (isSceneInitialized && scene?.background !== null) {
      setFo3dContainsBackground(true);
    } else {
      setFo3dContainsBackground(false);
    }
  }, [scene, isSceneInitialized, setFo3dContainsBackground]);

  return (
    <SparkRendererProvider>
      {isFo3dBackgroundOn && fo3dRoot && scene.background && (
        <Fo3dErrorBoundary ignoreError boundaryName="background">
          <Suspense fallback={null}>
            <Fo3dBackground background={scene.background} />
          </Suspense>
        </Fo3dErrorBoundary>
      )}
      <PointCloudCropContext.Provider value={pointCloudCrop}>
        <SceneR3f
          assetRoot={fo3dRoot}
          scene={scene}
          visibilityMap={visibilityMap}
        />
      </PointCloudCropContext.Provider>
    </SparkRendererProvider>
  );
};
