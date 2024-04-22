import React, { useMemo } from "react";
import { BoxGeometry, Mesh, Quaternion, Vector3 } from "three";
import { BoxGeometryAsset } from "../../hooks";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";

const DEFAULT_SEGMENTS = 3;

export const Box = ({
  name,
  box,
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  box: BoxGeometryAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children: React.ReactNode;
}) => {
  const boxGeometry = useMemo(
    () =>
      new BoxGeometry(
        box.width,
        box.height,
        box.depth,
        DEFAULT_SEGMENTS,
        DEFAULT_SEGMENTS,
        DEFAULT_SEGMENTS
      ),
    [box]
  );
  const { material } = useMeshMaterialControls(name, box.defaultMaterial);

  const mesh = useMemo(() => {
    if (!material) {
      return null;
    }

    return new Mesh(boxGeometry, material);
  }, [boxGeometry, material]);

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
