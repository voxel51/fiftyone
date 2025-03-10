import { getSampleSrc } from "@fiftyone/state";
import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { Mesh, type Quaternion, type Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import type { StlAsset } from "../../hooks";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";
import { useFo3dContext } from "../context";
import { getResolvedUrlForFo3dAsset } from "../utils";
import { useFoLoader } from "../../hooks/use-fo-loaders";

/**
 *  Renders a single STL mesh.
 *
 *  A 3D model in a STL format describes only the surface geometry of a 3D object
 *  without any representation of color, texture or other common CAD model attributes.
 */
export const Stl = ({
  name,
  stl: { stlPath, preTransformedStlPath, defaultMaterial },
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  stl: StlAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: React.ReactNode;
}) => {
  const { fo3dRoot } = useFo3dContext();

  const stlUrl = useMemo(
    () =>
      preTransformedStlPath ??
      getSampleSrc(getResolvedUrlForFo3dAsset(stlPath, fo3dRoot)),
    [stlPath, preTransformedStlPath, fo3dRoot]
  );

  const points = useFoLoader(STLLoader, stlUrl);
  const [mesh, setMesh] = useState(null);

  const { material } = useMeshMaterialControls(name, defaultMaterial);

  useEffect(() => {
    if (!material) {
      return;
    }

    if (points) {
      points.computeVertexNormals();

      const newMesh = new Mesh(points, material);
      setMesh(newMesh);
    }
  }, [points, stlUrl, material]);

  if (mesh) {
    return (
      <primitive
        object={mesh}
        position={position}
        quaternion={quaternion}
        scale={scale}
      >
        {children ?? null}
      </primitive>
    );
  }

  return null;
};
