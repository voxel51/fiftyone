import { useLoader } from "@react-three/fiber";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import { PcdReturnType } from "../hooks";
import { getIdentifierForAsset, getVisibilityMapFromFo3dParsed } from "./utils";

type PcdsProps = {
  pcds: PcdReturnType[];
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
  onLoad?: () => void;
};

const PcdMesh = ({
  pcd,
  onLoad,
}: {
  pcd: PcdReturnType;
  onLoad?: () => void;
}) => {
  const { position, quaternion, scale, pcdUrl } = pcd;

  const points = useLoader(PCDLoader, pcdUrl);

  useEffect(() => {
    if (points) {
      onLoad?.();
    }
  }, [points, onLoad]);

  return (
    <primitive
      object={points}
      position={position}
      quaternion={quaternion}
      scale={scale}
    />
  );
};

export const Pcds = ({ pcds, visibilityMap, onLoad }: PcdsProps) => {
  const totalPcdsLoaded = useRef(0);

  const onPcdLoad = useCallback(() => {
    totalPcdsLoaded.current += 1;
    if (totalPcdsLoaded.current === pcds.length) {
      onLoad?.();
    }
  }, [pcds, onLoad]);

  const pcdMeshes = useMemo(() => {
    return pcds
      .filter((pcd) => visibilityMap[getIdentifierForAsset(pcd)])
      .map((pcd) => {
        return (
          <group key={pcd.pcdUrl}>
            <PcdErrorBoundary>
              <PcdMesh pcd={pcd} onLoad={onPcdLoad} />
            </PcdErrorBoundary>
          </group>
        );
      });
  }, [pcds, visibilityMap]);

  return <>{pcdMeshes}</>;
};

// create error boundary for individual mesh
class PcdErrorBoundary extends React.Component {
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
