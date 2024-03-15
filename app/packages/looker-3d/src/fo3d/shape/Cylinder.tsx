import { useMemo } from "react";
import { CylinderGeometry, Mesh, Quaternion, Vector3 } from "three";
import { CylinderGeometryAsset } from "../../hooks";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";

export const Cylinder = ({
  name,
  cylinder,
  position,
  quaternion,
  scale,
}: {
  name: string;
  cylinder: CylinderGeometryAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const cylinderGeometry = useMemo(
    () =>
      new CylinderGeometry(
        cylinder.radiusTop,
        cylinder.radiusBottom,
        cylinder.height,
        cylinder.radialSegments,
        cylinder.heightSegments,
        cylinder.openEnded,
        cylinder.thetaStart,
        cylinder.thetaLength
      ),
    [cylinder]
  );
  const { material } = useMeshMaterialControls(name, cylinder);

  const mesh = useMemo(() => {
    if (!material) {
      return null;
    }

    return new Mesh(cylinderGeometry, material);
  }, [cylinderGeometry, material]);

  return (
    <primitive
      position={position}
      quaternion={quaternion}
      scale={scale}
      object={mesh}
    />
  );
};
