import { useLoader } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Mesh, MeshPhongMaterial, Quaternion, Vector3 } from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import { PlyAsset } from "../hooks";
import { getColorFromPoolBasedOnHash } from "../utils";

export const Ply = ({
  name,
  ply: { plyUrl },
  position,
  quaternion,
  scale,
}: {
  name: string;
  ply: PlyAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const geometry = useLoader(PLYLoader, plyUrl);
  const [mesh, setMesh] = useState(null);

  useEffect(() => {
    if (geometry) {
      // todo: check if geometry is meshes or points
      // todo: no need to compute vertex normals for points
      geometry.computeVertexNormals();
      geometry.center();

      // todo: use points material for points
      const material = new MeshPhongMaterial({
        color: getColorFromPoolBasedOnHash(plyUrl),
      });
      const newMesh = new Mesh(geometry, material);
      setMesh(newMesh);
    }
  }, [geometry]);

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
