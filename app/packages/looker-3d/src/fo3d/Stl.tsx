import { useLoader } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Mesh, MeshPhongMaterial, Quaternion, Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { StlAsset } from "../hooks";
import { getColorFromPoolBasedOnHash } from "../utils";

/**
 *  Renders a single STL mesh.
 *
 *  A 3D model in a STL format describes only the surface geometry of a 3D object
 *  without any representation of color, texture or other common CAD model attributes.
 */
export const Stl = ({
  stl: { stlUrl },
  position,
  quaternion,
  scale,
}: {
  stl: StlAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const points = useLoader(STLLoader, stlUrl);
  const [mesh, setMesh] = useState(null);

  useEffect(() => {
    if (points) {
      points.computeVertexNormals();

      const material = new MeshPhongMaterial({
        color: getColorFromPoolBasedOnHash(stlUrl),
      });
      const newMesh = new Mesh(points, material);
      setMesh(newMesh);
    }
  }, [points]);

  if (mesh) {
    return (
      <primitive
        object={mesh}
        position={position}
        quaternion={quaternion}
        scale={scale}
      />
    );
  }

  return null;
};
