import { useLoader } from "@react-three/fiber";
import React, { useEffect, useMemo, useState } from "react";
import { Mesh, MeshPhongMaterial } from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import { PlyReturnType } from "../hooks";
import { getIdentifierForAsset, getVisibilityMapFromFo3dParsed } from "./utils";
import { getColorFromPoolBasedOnHash } from "../utils";

type PlysProps = {
  plys: PlyReturnType[];
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
};

const PlyMesh = ({ ply }: { ply: PlyReturnType }) => {
  const { plyUrl, position, quaternion, scale } = ply;
  const points = useLoader(PLYLoader, plyUrl);
  const [mesh, setMesh] = useState(null);

  useEffect(() => {
    if (points) {
      points.computeVertexNormals();

      const material = new MeshPhongMaterial({
        color: getColorFromPoolBasedOnHash(plyUrl),
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

export const Plys = ({ plys, visibilityMap }: PlysProps) => {
  const plyMeshes = useMemo(() => {
    return plys
      .filter((ply) => visibilityMap[getIdentifierForAsset(ply)])
      .map((ply) => {
        return (
          <group key={ply.plyUrl}>
            <PlyErrorBoundary>
              <PlyMesh ply={ply} />
            </PlyErrorBoundary>
          </group>
        );
      });
  }, [plys, visibilityMap]);

  return <group>{plyMeshes}</group>;
};

// create error boundary for individual mesh
class PlyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    // @ts-ignore
    if (this.state.hasError) {
      // todo: add indicator in canvas that asset failed loading
      return null;
    }

    // @ts-ignore
    return this.props.children;
  }
}
