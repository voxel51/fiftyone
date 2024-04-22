import { useLoader } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Mesh, Quaternion, Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { StlAsset } from "../hooks";
import { useMeshMaterialControls } from "../hooks/use-mesh-material-controls";

/**
 *  Renders a single STL mesh.
 *
 *  A 3D model in a STL format describes only the surface geometry of a 3D object
 *  without any representation of color, texture or other common CAD model attributes.
 */
export const Stl = ({
  name,
  stl,
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
  const points = useLoader(STLLoader, stl.stlUrl);
  const [mesh, setMesh] = useState(null);

  const { material } = useMeshMaterialControls(name, stl.defaultMaterial);

  useEffect(() => {
    if (!material) {
      return;
    }

    if (points) {
      points.computeVertexNormals();

      const newMesh = new Mesh(points, material);
      setMesh(newMesh);
    }
  }, [points, stl, material]);

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
