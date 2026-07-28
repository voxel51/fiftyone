import { getSampleSrc, isInMultiPanelViewAtom } from "@fiftyone/state";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import {
  type BufferGeometry,
  type LoadingManager,
  Mesh,
  Points,
  type Quaternion,
  Vector3,
} from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import { HoveredPointMarker } from "../../components/HoveredPointMarker";
import { useFoLoader } from "../../hooks/use-fo-loaders";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";
import { usePointCloudHoverFromRaycast } from "../../hooks/use-point-cloud-hover-from-raycast";
import type { PointCloudCrop } from "../../utils/point-cloud-crop";
import { useFo3dContext } from "../context";
import { usePcdMaterial } from "../point-cloud/use-pcd-material";
import { GaussianSplatAsset } from "../render-types";
import type {
  FoMeshBasicMaterialProps,
  FoMeshMaterial,
  FoPointcloudMaterialProps,
  PlyAsset,
} from "../render-types";
import { GaussianSplat } from "../splat/GaussianSplat";
import { getBasePathForTextures, getResolvedUrlForFo3dAsset } from "../utils";
import { sniffPlyIsGaussianSplat } from "./ply-splat-detection";

interface PlyProps {
  name: string;
  ply: PlyAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: React.ReactNode;
  pointCloudCrop?: PointCloudCrop | null;
  requiresCovariance?: boolean;
}

type PlySplatDetection = {
  plyUrl: string;
  isGaussianSplat: boolean;
};

/**
 * Sniffs one PLY URL and reports the result only while that URL is current.
 * The caller can keep rendering nothing during the initial `null` state.
 */
export const usePlySplatDetection = (
  plyUrl: string,
  loadingManager?: Pick<LoadingManager, "itemStart" | "itemEnd" | "itemError">,
) => {
  const [splatDetection, setSplatDetection] =
    useState<PlySplatDetection | null>(null);
  const currentDetection =
    splatDetection?.plyUrl === plyUrl ? splatDetection : null;

  // This effect sniffs the PLY header so Gaussian PLYs are routed through
  // Spark without asking Three's ordinary PLY loader to parse the full file.
  useEffect(() => {
    let cancelled = false;
    let loadingEnded = false;
    const abortController = new AbortController();
    const headerUrl = `${plyUrl}#ply-splat-header`;
    const endLoading = () => {
      if (loadingEnded) {
        return;
      }

      loadingManager?.itemEnd(headerUrl);
      loadingEnded = true;
    };

    loadingManager?.itemStart(headerUrl);

    sniffPlyIsGaussianSplat(plyUrl, abortController.signal)
      .then((result) => {
        if (!cancelled) {
          setSplatDetection({ plyUrl, isGaussianSplat: result });
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Classification is an optimization for routing Gaussian PLYs. If it
          // fails, preserve the established behavior and let Three load the PLY.
          setSplatDetection({ plyUrl, isGaussianSplat: false });
        }
      })
      .finally(endLoading);

    return () => {
      cancelled = true;
      abortController.abort();
      endLoading();
    };
  }, [loadingManager, plyUrl]);

  return currentDetection;
};

const DEFAULT_PLY_MATERIAL: FoMeshMaterial = {
  _type: "MeshStandardMaterial",
  color: "#ffffff",
  emissiveColor: "#000000",
  emissiveIntensity: 0,
  metalness: 0,
  roughness: 1,
  opacity: 1,
  wireframe: false,
  vertexColors: true,
};

/** Resolves whether a PLY geometry should use point-cloud rendering. */
export const inferPlyIsPointCloud = (
  geometry: BufferGeometry | null | undefined,
  explicitIsPointCloud: boolean | undefined,
) => {
  if (typeof explicitIsPointCloud === "boolean") {
    return explicitIsPointCloud;
  }

  return (geometry?.getIndex()?.count ?? 0) === 0;
};

const PlyWithPointsMaterial = ({
  name,
  geometry,
  defaultMaterial,
  quaternion,
  vertexColorsAvailable,
  pointCloudCrop,
}: {
  name: string;
  geometry: BufferGeometry;
  defaultMaterial: FoMeshMaterial;
  quaternion: Quaternion;
  vertexColorsAvailable: boolean;
  pointCloudCrop?: PointCloudCrop | null;
}) => {
  const overrideMaterial = {
    shadingMode: "height",
    customColor: defaultMaterial["color"] ?? "#ffffff",
    pointSize: 2,
    attenuateByDistance: false,
    opacity: defaultMaterial.opacity,
  } as FoPointcloudMaterialProps;

  const pointsContainerRef = useRef<Points>(null);

  const { pointsMaterial, shadingMode } = usePcdMaterial(
    name,
    geometry,
    overrideMaterial,
    pointsContainerRef,
    quaternion,
    vertexColorsAvailable,
    pointCloudCrop,
  );

  const mesh = useMemo(() => new Points(geometry), [geometry]);

  const { currentHoveredPoint } = usePointCloudHoverFromRaycast({
    geometry,
    assetName: name,
    shadingMode,
    pointsRef: pointsContainerRef,
  });

  const { setHoverMetadata } = useFo3dContext();

  // This effect updates hover metadata when point-cloud shading changes.
  useEffect(() => {
    setHoverMetadata((prev) => ({
      ...prev,
      renderModeDescriptor: shadingMode,
    }));
  }, [setHoverMetadata, shadingMode]);

  if (!geometry || !pointsMaterial) {
    return null;
  }

  return (
    <>
      {currentHoveredPoint && (
        <HoveredPointMarker position={currentHoveredPoint} />
      )}
      <primitive ref={pointsContainerRef} object={mesh}>
        {pointsMaterial}
      </primitive>
    </>
  );
};

const PlyWithMaterialOverride = ({
  name,
  geometry,
  defaultMaterial,
}: {
  name: string;
  geometry: BufferGeometry;
  defaultMaterial: FoMeshMaterial;
}) => {
  const basicMaterial = useMemo(
    () =>
      ({
        ...defaultMaterial,
        vertexColors: true,
        color: "#ffffff",
      }) as FoMeshBasicMaterialProps,
    [defaultMaterial],
  );

  const { material } = useMeshMaterialControls(name, basicMaterial);

  const mesh = useMemo(() => {
    return new Mesh(geometry, material);
  }, [geometry, material]);

  if (!mesh) {
    return null;
  }

  return <primitive object={mesh} />;
};

const PlyWithNoMaterialOverride = ({
  name,
  geometry,
  defaultMaterial,
}: {
  name: string;
  geometry: BufferGeometry;
  defaultMaterial: FoMeshMaterial;
}) => {
  const { material } = useMeshMaterialControls(name, defaultMaterial);

  const mesh = useMemo(() => {
    return new Mesh(geometry, material);
  }, [geometry, material]);

  if (!mesh) {
    return null;
  }

  return <primitive object={mesh} />;
};

const PlyGeometry = ({
  name,
  ply: {
    plyPath,
    preTransformedPlyPath,
    defaultMaterial,
    isPcd,
    centerGeometry,
  },
  position,
  quaternion,
  scale,
  children,
  pointCloudCrop,
}: PlyProps) => {
  const { fo3dRoot } = useFo3dContext();
  const isInMultiPanelView = useRecoilValue(isInMultiPanelViewAtom);

  const plyUrl = useMemo(
    () =>
      preTransformedPlyPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(plyPath, fo3dRoot)),
    [plyPath, preTransformedPlyPath, fo3dRoot],
  );

  const resourcePath = useMemo(
    () => getBasePathForTextures(fo3dRoot, plyUrl),
    [fo3dRoot, plyUrl],
  );

  const geometry_ = useFoLoader(PLYLoader, plyUrl, (loader) => {
    loader.resourcePath = resourcePath;
  });

  // Clone geometry when in multipanel view to avoid React Three Fiber caching issues
  const geometry = useMemo(() => {
    if (isInMultiPanelView && geometry_) {
      return geometry_.clone();
    }
    return geometry_;
  }, [geometry_, isInMultiPanelView]);

  const [isUsingVertexColors, setIsUsingVertexColors] = useState(false);
  const [isGeometryResolved, setIsGeometryResolved] = useState(false);
  const resolvedDefaultMaterial = useMemo(
    () => defaultMaterial ?? DEFAULT_PLY_MATERIAL,
    [defaultMaterial],
  );
  const shouldRenderAsPointCloud = useMemo(
    () => inferPlyIsPointCloud(geometry, isPcd),
    [geometry, isPcd],
  );

  // This effect prepares loaded PLY geometry for its resolved render mode.
  useEffect(() => {
    setIsGeometryResolved(false);
    setIsUsingVertexColors(false);

    if (!geometry) {
      return;
    }

    if (
      geometry.attributes?.position?.count &&
      !geometry.attributes.normal?.count
    ) {
      geometry.computeVertexNormals();

      if (centerGeometry) {
        geometry.center();
      }
    }

    if (geometry.attributes?.color?.count) {
      setIsUsingVertexColors(true);
    }

    setIsGeometryResolved(true);
  }, [geometry, centerGeometry]);

  const mesh = useMemo(() => {
    if (!isGeometryResolved) {
      return null;
    }

    if (shouldRenderAsPointCloud) {
      return (
        <PlyWithPointsMaterial
          name={name}
          geometry={geometry}
          defaultMaterial={resolvedDefaultMaterial}
          quaternion={quaternion}
          vertexColorsAvailable={isUsingVertexColors}
          pointCloudCrop={pointCloudCrop}
        />
      );
    }

    if (isUsingVertexColors) {
      return (
        <PlyWithMaterialOverride
          name={name}
          geometry={geometry}
          defaultMaterial={resolvedDefaultMaterial}
        />
      );
    }

    return (
      <PlyWithNoMaterialOverride
        name={name}
        geometry={geometry}
        defaultMaterial={resolvedDefaultMaterial}
      />
    );
  }, [
    isGeometryResolved,
    isUsingVertexColors,
    geometry,
    shouldRenderAsPointCloud,
    name,
    resolvedDefaultMaterial,
    quaternion,
    pointCloudCrop,
  ]);

  if (!mesh) {
    return null;
  }

  return (
    <group position={position} quaternion={quaternion} scale={scale}>
      {mesh}
      <group>{children ?? null}</group>
    </group>
  );
};

/** Routes a PLY asset to Spark, a point cloud, or a triangle mesh. */
export const Ply = (props: PlyProps) => {
  const {
    name,
    ply: { plyPath, preTransformedPlyPath, centerGeometry },
    position,
    quaternion,
    scale,
    children,
    requiresCovariance,
  } = props;
  const { fo3dRoot, loadingManager } = useFo3dContext();

  const plyUrl = useMemo(
    () =>
      preTransformedPlyPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(plyPath, fo3dRoot)),
    [plyPath, preTransformedPlyPath, fo3dRoot],
  );
  const currentDetection = usePlySplatDetection(plyUrl, loadingManager);
  const isGaussianSplat = currentDetection?.isGaussianSplat ?? null;

  const splat = useMemo(
    () =>
      new GaussianSplatAsset(
        plyPath,
        preTransformedPlyPath,
        "ply",
        centerGeometry,
      ),
    [plyPath, preTransformedPlyPath, centerGeometry],
  );

  if (isGaussianSplat === null) {
    return null;
  }

  if (isGaussianSplat) {
    return (
      <GaussianSplat
        name={name}
        splat={splat}
        position={position}
        quaternion={quaternion}
        scale={scale}
        requiresCovariance={requiresCovariance}
      >
        {children}
      </GaussianSplat>
    );
  }

  return <PlyGeometry {...props} />;
};
