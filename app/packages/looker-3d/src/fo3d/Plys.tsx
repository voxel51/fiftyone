import { useLoader } from "@react-three/fiber";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Mesh, MeshPhongMaterial } from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import { PlyReturnType } from "../hooks";
import { getColorFromPoolBasedOnHash } from "../utils";
import { getIdentifierForAsset, getVisibilityMapFromFo3dParsed } from "./utils";

type PlysProps = {
  plys: PlyReturnType[];
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
  onLoad?: () => void;
};

const PlyMesh = ({
  ply,
  onLoad,
}: {
  ply: PlyReturnType;
  onLoad?: () => void;
}) => {
  const { plyUrl, position, quaternion, scale } = ply;
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

      // hack to wait for geometry to be loaded
      // todo: find a better way to do this
      setTimeout(() => {
        onLoad?.();
      }, 50);
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

export const Plys = ({ plys, visibilityMap, onLoad }: PlysProps) => {
  const totalPlysLoaded = useRef(0);

  const onPlyLoad = useCallback(() => {
    totalPlysLoaded.current += 1;
    if (totalPlysLoaded.current === plys.length) {
      onLoad?.();
    }
  }, [plys, onLoad]);

  const plyMeshes = useMemo(() => {
    return plys
      .filter((ply) => visibilityMap[getIdentifierForAsset(ply)])
      .map((ply) => {
        return (
          <group key={ply.plyUrl}>
            <PlyErrorBoundary>
              <PlyMesh ply={ply} onLoad={onPlyLoad} />
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
