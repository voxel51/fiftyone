import { useMemo } from "react";
import { Mesh, Quaternion, SphereGeometry, Vector3 } from "three";
import { SphereGeometryAsset } from "../../hooks";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";

export const Sphere = ({
  name,
  sphere,
  position,
  quaternion,
  scale,
}: {
  name: string;
  sphere: SphereGeometryAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const sphereGeometry = useMemo(
    () =>
      new SphereGeometry(
        sphere.radius,
        sphere.widthSegments,
        sphere.heightSegments,
        sphere.phiStart,
        sphere.phiLength,
        sphere.thetaStart,
        sphere.thetaLength
      ),
    [sphere]
  );
  const { material } = useMeshMaterialControls(name, sphere);

  const mesh = useMemo(() => {
    if (!material) {
      return null;
    }

    return new Mesh(sphereGeometry, material);
  }, [sphereGeometry, material]);

  return (
    <primitive
      position={position}
      quaternion={quaternion}
      scale={scale}
      object={mesh}
    />
  );
};
