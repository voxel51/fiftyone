import { getSampleSrc } from "@fiftyone/state";
import { useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import { PcdAsset } from "../../hooks";
import { useFo3dContext } from "../context";
import { getResolvedUrlForFo3dAsset } from "../utils";
import { usePcdMaterial } from "./use-pcd-material";

export const Pcd = ({
  name,
  pcd: { pcdPath, preTransformedPcdPath, defaultMaterial },
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  pcd: PcdAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: React.ReactNode;
}) => {
  const { fo3dRoot } = useFo3dContext();

  const pcdUrl = useMemo(
    () =>
      preTransformedPcdPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(pcdPath, fo3dRoot)),
    [pcdPath, preTransformedPcdPath, fo3dRoot]
  );

  const points = useLoader(PCDLoader, pcdUrl);
  const pcdContainerRef = useRef();

  const pointsMaterialElement = usePcdMaterial(
    name,
    points.geometry,
    defaultMaterial,
    pcdContainerRef
  );

  if (!points) {
    return null;
  }

  return (
    <primitive
      ref={pcdContainerRef}
      object={points}
      position={position}
      quaternion={quaternion}
      scale={scale}
    >
      {pointsMaterialElement}
      {children ?? null}
    </primitive>
  );
};
