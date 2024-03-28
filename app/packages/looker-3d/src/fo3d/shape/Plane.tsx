import { useMemo } from "react";
import { Mesh, PlaneGeometry, Quaternion, Vector3 } from "three";
import { PlaneGeometryAsset } from "../../hooks";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";

const DEFAULT_SEGMENTS = 3;

export const Plane = ({
  name,
  plane,
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  plane: PlaneGeometryAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children: React.ReactNode;
}) => {
  const planeGeometry = useMemo(
    () =>
      new PlaneGeometry(
        plane.width,
        plane.height,
        DEFAULT_SEGMENTS,
        DEFAULT_SEGMENTS
      ),
    [plane]
  );
  const { material } = useMeshMaterialControls(name, plane);

  const mesh = useMemo(() => {
    if (!material) {
      return null;
    }

    // we want to see the back side of the plane as well
    material.side = 2; // DoubleSide

    return new Mesh(planeGeometry, material);
  }, [planeGeometry, material]);

  return (
    <primitive
      position={position}
      quaternion={quaternion}
      scale={scale}
      object={mesh}
    >
      {children ?? null}
    </primitive>
  );
};
