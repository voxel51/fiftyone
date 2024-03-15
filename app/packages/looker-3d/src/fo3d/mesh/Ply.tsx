import { useLoader } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Mesh, Quaternion, Vector3 } from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import { PlyAsset } from "../../hooks";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";

export const Ply = ({
  name,
  ply,
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
  const geometry = useLoader(PLYLoader, ply.plyUrl);
  const [mesh, setMesh] = useState(null);

  const { material } = useMeshMaterialControls(name, ply);

  useEffect(() => {
    if (!material) {
      return;
    }

    if (geometry) {
      // todo: check if geometry is meshes or points
      // todo: no need to compute vertex normals for points
      geometry.computeVertexNormals();
      geometry.center();

      // todo: use points material for points
      const newMesh = new Mesh(geometry, material);
      setMesh(newMesh);
    }
  }, [geometry, material]);

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
