import { getSampleSrc } from "@fiftyone/state";
import {
  ExtSplats,
  PackedSplats,
  SplatFileType,
  SplatLoader,
  SplatMesh,
} from "@sparkjsdev/spark";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Box3,
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  type Quaternion,
  Vector3,
} from "three";
import { configureFoLoaderInstance } from "../../hooks/use-fo-loaders";
import { useFo3dContext } from "../context";
import type { GaussianSplatAsset } from "../render-types";
import { getResolvedUrlForFo3dAsset } from "../utils";
import { SPARK_MAX_STANDARD_DEVIATIONS } from "./constants";
import { useSparkRenderer } from "./SparkRendererRoot";

interface GaussianSplatProps {
  name: string;
  splat: GaussianSplatAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: ReactNode;
}

type LoadedSplat = {
  mesh: SplatMesh;
  boundsProxy: Mesh | null;
  bounds: Box3;
};

const BOUNDS_PROXY_MATERIAL = new MeshBasicMaterial({ visible: false });
const SPLAT_BOUNDS_BATCH_SIZE = 10_000;
const SPLAT_FILE_TYPES_BY_EXTENSION: Record<string, SplatFileType> = {
  ksplat: SplatFileType.KSPLAT,
  pcsogs: SplatFileType.PCSOGS,
  ply: SplatFileType.PLY,
  rad: SplatFileType.RAD,
  sog: SplatFileType.PCSOGSZIP,
  spz: SplatFileType.SPZ,
  splat: SplatFileType.SPLAT,
};

const disposeLoadedSplat = (loadedSplat: LoadedSplat | null) => {
  if (!loadedSplat) {
    return;
  }

  loadedSplat.mesh.dispose();
  loadedSplat.boundsProxy?.geometry.dispose();
};

const getNormalizedFormat = (format: string | undefined) => {
  return format?.trim().toLowerCase().replace(/^\./, "");
};

const getFileExtension = (pathOrUrl: string) => {
  const pathWithoutQuery = pathOrUrl.split(/[?#]/, 1)[0];
  const filename = pathWithoutQuery.split(/[\\/]/).pop() ?? "";
  const lastDot = filename.lastIndexOf(".");

  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return undefined;
  }

  return filename.slice(lastDot + 1).toLowerCase();
};

const disposeDecodedSplats = (
  decodedSplats: ExtSplats | PackedSplats | null,
) => {
  decodedSplats?.dispose();
};

type SplatBoundsSource = Pick<PackedSplats, "forEachSplat">;
type IndexedSplatBoundsSource = Pick<PackedSplats, "getNumSplats" | "getSplat">;

const expandBoundsBySplat = (
  bounds: Box3,
  splatMin: Vector3,
  splatMax: Vector3,
  center: Vector3,
  scales: Vector3,
  quaternion: Quaternion,
) => {
  const { x, y, z, w } = quaternion;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const ww = w * w;
  const xy = x * y;
  const xz = x * z;
  const xw = x * w;
  const yz = y * z;
  const yw = y * w;
  const zw = z * w;
  const sx = Math.abs(scales.x) * SPARK_MAX_STANDARD_DEVIATIONS;
  const sy = Math.abs(scales.y) * SPARK_MAX_STANDARD_DEVIATIONS;
  const sz = Math.abs(scales.z) * SPARK_MAX_STANDARD_DEVIATIONS;
  const extentX =
    Math.abs(xx + ww - yy - zz) * sx +
    Math.abs(2 * (xy - zw)) * sy +
    Math.abs(2 * (xz + yw)) * sz;
  const extentY =
    Math.abs(2 * (xy + zw)) * sx +
    Math.abs(ww - xx + yy - zz) * sy +
    Math.abs(2 * (yz - xw)) * sz;
  const extentZ =
    Math.abs(2 * (xz - yw)) * sx +
    Math.abs(2 * (yz + xw)) * sy +
    Math.abs(ww - xx - yy + zz) * sz;

  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(center.z) ||
    !Number.isFinite(extentX) ||
    !Number.isFinite(extentY) ||
    !Number.isFinite(extentZ)
  ) {
    return;
  }

  splatMin.set(center.x - extentX, center.y - extentY, center.z - extentZ);
  splatMax.set(center.x + extentX, center.y + extentY, center.z + extentZ);
  bounds.expandByPoint(splatMin);
  bounds.expandByPoint(splatMax);
};

/**
 * Computes exact oriented-splat AABBs without evaluating all eight corners
 * for every Gaussian. The absolute rotation matrix maps each splat's local
 * half-extents directly to its world-aligned half-extents.
 */
export const computeSplatBounds = (splats: SplatBoundsSource) => {
  const bounds = new Box3();
  const splatMin = new Vector3();
  const splatMax = new Vector3();

  splats.forEachSplat((_index, center, scales, quaternion) => {
    expandBoundsBySplat(bounds, splatMin, splatMax, center, scales, quaternion);
  });

  return bounds;
};

const computeSplatBoundsIncrementally = async (
  splats: IndexedSplatBoundsSource,
  signal: AbortSignal,
) => {
  const bounds = new Box3();
  const splatMin = new Vector3();
  const splatMax = new Vector3();
  const splatCount = splats.getNumSplats();

  for (let index = 0; index < splatCount; index++) {
    if (signal.aborted) {
      throw new DOMException("Splat bounds calculation aborted", "AbortError");
    }

    const { center, scales, quaternion } = splats.getSplat(index);
    expandBoundsBySplat(bounds, splatMin, splatMax, center, scales, quaternion);

    if ((index + 1) % SPLAT_BOUNDS_BATCH_SIZE === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return bounds;
};

const getSplatBoundsSource = (mesh: SplatMesh) => {
  const decodedSplats = mesh.extSplats ?? mesh.packedSplats;
  return decodedSplats && decodedSplats.getNumSplats() > 0
    ? decodedSplats
    : decodedSplats?.lodSplats;
};

/**
 * Spark stores on-the-fly LoD data on the decoded source's `lodSplats` while
 * leaving the parent buffer empty. Read bounds from that LoD source when
 * necessary so camera framing and `centerGeometry` work for LoD-only loads.
 */
export const getSplatBounds = (mesh: SplatMesh) => {
  const boundsSource = getSplatBoundsSource(mesh);

  return boundsSource
    ? computeSplatBounds(boundsSource)
    : mesh.getBoundingBox(false);
};

const getSplatBoundsIncrementally = (mesh: SplatMesh, signal: AbortSignal) => {
  const boundsSource = getSplatBoundsSource(mesh);
  return boundsSource
    ? computeSplatBoundsIncrementally(boundsSource, signal)
    : Promise.resolve(mesh.getBoundingBox(false));
};

const getFileNameHint = (effectiveSplatPath: string, splatUrl: string) => {
  const source = effectiveSplatPath || splatUrl;

  try {
    const baseUrl =
      typeof window !== "undefined" ? window.location.href : "http://localhost";

    return decodeURIComponent(
      new URL(source, baseUrl).pathname.split(/[\\/]/).pop() ?? source,
    );
  } catch {
    return source.split(/[\\/]/).pop()?.split(/[?#]/)[0] ?? source;
  }
};

/** Resolves Spark's file type from an explicit hint or source extension. */
export const getSplatFileTypeHint = ({
  format,
  preTransformedSplatPath,
  splatPath,
  splatUrl,
}: {
  format?: string;
  preTransformedSplatPath?: string;
  splatPath: string;
  splatUrl: string;
}) => {
  const normalizedFormat = getNormalizedFormat(format);
  const extensions = preTransformedSplatPath
    ? [
        getFileExtension(preTransformedSplatPath),
        normalizedFormat,
        getFileExtension(splatUrl),
        getFileExtension(splatPath),
      ]
    : [
        normalizedFormat,
        getFileExtension(splatPath),
        getFileExtension(splatUrl),
      ];

  for (const extension of extensions) {
    if (!extension) {
      continue;
    }

    const fileType = SPLAT_FILE_TYPES_BY_EXTENSION[extension];
    if (fileType) {
      return fileType;
    }
  }

  return undefined;
};

/**
 * Returns whether Spark's covariance pipeline is needed to preserve the full
 * object transform. Its packed-splat path reduces object scale to one scalar,
 * which is only exact for equal, non-negative scale components.
 */
export const requiresCovarianceSplatTransform = (scale: Vector3) => {
  return (
    scale.x < 0 ||
    scale.y < 0 ||
    scale.z < 0 ||
    scale.x !== scale.y ||
    scale.y !== scale.z
  );
};

const createBoundsProxy = (bounds: Box3) => {
  if (bounds.isEmpty()) {
    return null;
  }

  const size = bounds.getSize(new Vector3());
  const proxy = new Mesh(
    new BoxGeometry(size.x, size.y, size.z),
    BOUNDS_PROXY_MATERIAL,
  );
  proxy.visible = false;

  return proxy;
};

/**
 * Renders a Gaussian splat asset through Spark.
 */
export const GaussianSplat = ({
  name,
  splat: { splatPath, preTransformedSplatPath, format, centerGeometry },
  position,
  quaternion,
  scale,
  children,
}: GaussianSplatProps) => {
  const requiresCovariance = requiresCovarianceSplatTransform(scale);
  useSparkRenderer({ requiresCovariance });

  const { fo3dRoot, loadingManager } = useFo3dContext();
  const [loadedSplat, setLoadedSplat] = useState<LoadedSplat | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const splatUrl = useMemo(
    () =>
      preTransformedSplatPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(splatPath, fo3dRoot)),
    [splatPath, preTransformedSplatPath, fo3dRoot],
  );
  const effectiveSplatPath = preTransformedSplatPath ?? splatPath;

  const fileName = useMemo(
    () => getFileNameHint(effectiveSplatPath, splatUrl),
    [effectiveSplatPath, splatUrl],
  );

  const fileTypeHint = useMemo(
    () =>
      getSplatFileTypeHint({
        format,
        preTransformedSplatPath,
        splatPath,
        splatUrl,
      }),
    [format, preTransformedSplatPath, splatPath, splatUrl],
  );

  // This effect loads the requested splat and disposes every intermediate or
  // mounted Spark resource when the source changes or the component unmounts.
  useEffect(() => {
    let cancelled = false;
    let activeSplat: LoadedSplat | null = null;
    const boundsAbortController = new AbortController();

    setLoadedSplat(null);
    setLoadError(null);

    const loadSplat = async () => {
      const loader = new SplatLoader(loadingManager ?? undefined);
      configureFoLoaderInstance(loader, splatUrl, loadingManager);
      let decodedSplats: ExtSplats | PackedSplats | null = null;
      let mesh: SplatMesh | null = null;

      try {
        if (requiresCovariance) {
          const extSplats = new ExtSplats();
          decodedSplats = extSplats;
          await loader.loadInternalAsync({
            extSplats,
            fileName,
            fileType: fileTypeHint,
            lod: true,
            url: splatUrl,
          });
        } else {
          const packedSplats = new PackedSplats();
          decodedSplats = packedSplats;
          await loader.loadInternalAsync({
            packedSplats,
            fileName,
            fileType: fileTypeHint,
            lod: true,
            url: splatUrl,
          });
        }

        if (cancelled) {
          disposeDecodedSplats(decodedSplats);
          return;
        }

        mesh = requiresCovariance
          ? new SplatMesh({
              covSplats: true,
              extSplats: decodedSplats as ExtSplats,
              lod: true,
            })
          : new SplatMesh({
              lod: true,
              packedSplats: decodedSplats as PackedSplats,
            });
        decodedSplats = null; // ownership transferred to SplatMesh
        await mesh.initialized;

        if (cancelled) {
          mesh.dispose();
          return;
        }

        const bounds = await getSplatBoundsIncrementally(
          mesh,
          boundsAbortController.signal,
        );
        if (cancelled) {
          mesh.dispose();
          return;
        }

        const nextSplat = {
          mesh,
          bounds,
          boundsProxy: createBoundsProxy(bounds),
        };

        activeSplat = nextSplat;
        setLoadedSplat(nextSplat);
      } catch (error) {
        mesh?.dispose();
        disposeDecodedSplats(decodedSplats);
        throw error;
      }
    };

    loadSplat().catch((error) => {
      if (cancelled) {
        return;
      }

      setLoadError(error instanceof Error ? error : new Error(String(error)));
    });

    return () => {
      cancelled = true;
      boundsAbortController.abort();
      disposeLoadedSplat(activeSplat);
    };
  }, [fileName, fileTypeHint, loadingManager, requiresCovariance, splatUrl]);

  const placement = useMemo(() => {
    if (!loadedSplat) {
      return null;
    }

    const center = loadedSplat.bounds.getCenter(new Vector3());
    const shouldCenterGeometry = centerGeometry ?? true;
    const centerOffset = shouldCenterGeometry
      ? center.clone().multiplyScalar(-1)
      : new Vector3();

    return {
      boundsProxyPosition: center.add(centerOffset),
      centerOffset,
    };
  }, [centerGeometry, loadedSplat]);

  if (loadError) {
    throw loadError;
  }

  if (!loadedSplat || !placement) {
    return null;
  }

  return (
    <group position={position} quaternion={quaternion} scale={scale}>
      <primitive
        name={name}
        object={loadedSplat.mesh}
        position={placement.centerOffset}
      />
      {loadedSplat.boundsProxy && (
        <primitive
          name={`${name}-bounds`}
          object={loadedSplat.boundsProxy}
          position={placement.boundsProxyPosition}
        />
      )}
      {children ?? null}
    </group>
  );
};
