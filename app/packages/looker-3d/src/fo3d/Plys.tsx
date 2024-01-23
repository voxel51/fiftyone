import { useLoader } from "@react-three/fiber";
import React, { useEffect, useMemo, useState } from "react";
import { Mesh, MeshPhongMaterial, MeshStandardMaterial } from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import { PlyReturnType } from "../hooks";
import { getIdentifierForAsset, getVisibilityMapFromFo3dParsed } from "./utils";

type PlysProps = {
  plys: PlyReturnType[];
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
};

const PlyMesh = ({ plyUrl }: { plyUrl: string }) => {
  const points = useLoader(PLYLoader, plyUrl);
  const [mesh, setMesh] = useState(null);

  useEffect(() => {
    if (points) {
      points.computeVertexNormals();

      const material = new MeshPhongMaterial({
        color: 0xffffff,
      });
      const newMesh = new Mesh(points, material);
      setMesh(newMesh);
    }
  }, [points]);

  if (mesh) {
    return <primitive object={mesh} />;
  }

  return null;
};

export const Plys = ({ plys, visibilityMap }: PlysProps) => {
  const plyMeshes = useMemo(() => {
    return plys
      .filter((ply) => visibilityMap[getIdentifierForAsset(ply)])
      .map((ply) => {
        const { plyUrl } = ply;
        return (
          <group key={plyUrl}>
            {/* <PlyErrorBoundary> */}
            <PlyMesh plyUrl={plyUrl} />
            {/* </PlyErrorBoundary> */}
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
    if (this.state.hasError) {
      // todo: add indicator in canvas that asset failed loading
      return null;
    }

    return this.props.children;
  }
}
