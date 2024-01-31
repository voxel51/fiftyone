import { useLoader } from "@react-three/fiber";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Mesh, MeshPhongMaterial } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { StlReturnType } from "../hooks";
import { getColorFromPoolBasedOnHash } from "../utils";
import { getIdentifierForAsset, getVisibilityMapFromFo3dParsed } from "./utils";

type StlsProps = {
  stls: StlReturnType[];
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
  onLoad?: () => void;
};

/**
 *  Renders a single STL mesh.
 *
 *  A 3D model in a STL format describes only the surface geometry of a 3D object
 *  without any representation of color, texture or other common CAD model attributes.
 */
const StlMesh = ({
  stl,
  onLoad,
}: {
  stl: StlReturnType;
  onLoad?: () => void;
}) => {
  const { stlUrl, position, quaternion, scale } = stl;
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

      onLoad?.();
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

export const Stls = ({ stls, visibilityMap, onLoad }: StlsProps) => {
  const totalStlsLoaded = useRef(0);

  const onStlLoad = useCallback(() => {
    totalStlsLoaded.current += 1;
    if (totalStlsLoaded.current === stls.length) {
      onLoad?.();
    }
  }, [stls, onLoad]);

  const stlMeshes = useMemo(() => {
    return stls
      .filter((stl) => visibilityMap[getIdentifierForAsset(stl)])
      .map((stl) => {
        return (
          <group key={stl.stlUrl}>
            <StlErrorBoundary>
              <StlMesh stl={stl} onLoad={onStlLoad} />
            </StlErrorBoundary>
          </group>
        );
      });
  }, [stls, visibilityMap]);

  return <group>{stlMeshes}</group>;
};

// create error boundary for individual mesh
class StlErrorBoundary extends React.Component {
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
